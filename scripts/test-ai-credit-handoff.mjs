import test from "node:test";
import assert from "node:assert/strict";
import {runSyntheticCreditHandoff} from "../lib/ai/pilot/credit-handoff-simulation.mjs";
import {runSdkSyntheticPilot} from "../lib/ai/pilot/sdk-executor.mjs";

function scenario(overrides={}){
  const calls={reserve:[],claim:[],settle:[],models:[],validated:0,persisted:0};
  const creditPort={
    reserve:async key=>{calls.reserve.push(key);return {allowed:true,ledgerId:"ledger-00123",creditsRequired:1};},
    claim:async(ledger,key)=>{calls.claim.push([ledger,key]);return true;},
    settle:async(ledger,outcome,key)=>{calls.settle.push([ledger,outcome,key]);return {status:outcome,duplicate:false};},
  };
  const requestKey="case-00001234";
  const sdkConfig={
    enabled:true,environment:"isolated-test",openaiKey:"fake-openai-key",
    groqKey:"fake-groq-key",openaiModelId:"synthetic-openai-model",
    groqModelId:"openai/gpt-oss-120b",
    openaiModelAllowlist:["synthetic-openai-model"],
    groqModelAllowlist:["openai/gpt-oss-120b"],
    groqFallbackEnabled:true,
  };
  const simulation={
    enabled:true,synthetic:true,environment:"isolated-test",
    projectRef:"yyevuwvtrktrzwuzeddo",requestKey,
    creditPort,
    invoke:async()=>runSdkSyntheticPilot({
      prompt:"SYNTHETIC: invent a simple non-personal career pathway for a fictional graduate.",
      config:sdkConfig,record:async()=>{},
      generate:async ({model,maxRetries})=>{
        assert.equal(maxRetries,0);
        calls.models.push(model.modelId);
        return {text:"synthetic validated output",usage:{inputTokens:4,outputTokens:8}};
      },
    }),
    validate:async()=>{calls.validated++;return true;},
    persist:async()=>{calls.persisted++;return true;},
    ...overrides,
  };
  return {calls,simulation,sdkConfig};
}
const run=async obj=>runSyntheticCreditHandoff(obj);

test("one primary provider call reserves, claims and consumes exactly once",async()=>{
  const x=scenario();
  const result=await run(x.simulation);
  assert.equal(result.provider,"openai");
  assert.equal(result.productionAuthorized,false);
  assert.equal(x.calls.reserve.length,1);
  assert.equal(x.calls.claim.length,1);
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["consumed"]);
  assert.deepEqual(x.calls.models,["synthetic-openai-model"]);
  assert.equal(x.calls.validated,1);
  assert.equal(x.calls.persisted,1);
});

test("OpenAI 503 -> Groq uses SAME ledger and one settlement",async()=>{
  const x=scenario();
  x.simulation.invoke=async()=>runSdkSyntheticPilot({
    prompt:"SYNTHETIC: hypothetical career advice without personal data.",
    config:x.sdkConfig,record:async()=>{},
    generate:async ({model,maxRetries})=>{
      assert.equal(maxRetries,0);
      x.calls.models.push(model.modelId);
      if(x.calls.models.length===1)throw Object.assign(new Error("synthetic outage"),{status:503});
      return {text:"synthetic Groq fallback response"};
    },
  });
  const result=await run(x.simulation);
  assert.equal(result.provider,"groq");
  assert.deepEqual(x.calls.models,["synthetic-openai-model","openai/gpt-oss-120b"]);
  assert.equal(x.calls.reserve.length,1);
  assert.equal(x.calls.claim.length,1);
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["consumed"]);
});

test("reservation denied => no claim, inference or settlement",async()=>{
  const x=scenario();
  x.simulation.creditPort.reserve=async k=>{x.calls.reserve.push(k);return {allowed:false};};
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_RESERVATION_DENIED");
  assert.deepEqual(x.calls.models,[]);
  assert.equal(x.calls.claim.length,0);
  assert.equal(x.calls.settle.length,0);
});

test("claim rejected => no inference or unsafe release of another invocation",async()=>{
  const x=scenario();
  x.simulation.creditPort.claim=async()=>false;
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_CLAIM_REJECTED");
  assert.deepEqual(x.calls.models,[]);
  assert.equal(x.calls.settle.length,0);
});

test("both provider attempts fail => release once",async()=>{
  const x=scenario();
  x.simulation.invoke=async()=>runSdkSyntheticPilot({
    prompt:"SYNTHETIC: fictional career prompt.",
    config:x.sdkConfig,record:async()=>{},
    generate:async({model,maxRetries})=>{
      assert.equal(maxRetries,0);
      x.calls.models.push(model.modelId);
      throw Object.assign(new Error("unavailable"),{status:503});
    },
  });
  await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_EXECUTION_FAILED");
  assert.equal(x.calls.models.length,2);
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["released"]);
});

test("quota exhaustion never invokes Groq and releases once",async()=>{
  const x=scenario();
  x.simulation.invoke=async()=>runSdkSyntheticPilot({
    prompt:"SYNTHETIC: fictional career prompt.",
    config:x.sdkConfig,record:async()=>{},
    generate:async ({model,maxRetries})=>{
      assert.equal(maxRetries,0);
      x.calls.models.push(model.modelId);
      throw Object.assign(new Error("exhausted"),{status:429,error:{code:"insufficient_quota"}});
    },
  });
  await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_EXECUTION_FAILED");
  assert.deepEqual(x.calls.models,["synthetic-openai-model"]);
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["released"]);
});

test("invalid output after generation releases once, not consumed",async()=>{
  const x=scenario({validate:async()=>false});
  await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_OUTPUT_NOT_VALIDATED");
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["released"]);
});

test("failed persistence releases once, not consumed",async()=>{
  const x=scenario({persist:async()=>false});
  await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_OUTPUT_NOT_PERSISTED");
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["released"]);
});

test("consumed settlement failure requires reconciliation; no second release attempt",async()=>{
  const x=scenario();
  x.simulation.creditPort.settle=async(ledger,outcome,key)=>{
    x.calls.settle.push([ledger,outcome,key]);
    throw Error("ambiguous database timeout");
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_SETTLEMENT_UNCONFIRMED");
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["consumed"]);
});

test("release settlement failure is never retried or converted to consumption",async()=>{
  const x=scenario({invoke:async()=>{throw Error("provider offline");}});
  x.simulation.creditPort.settle=async(ledger,outcome,key)=>{
    x.calls.settle.push([ledger,outcome,key]);
    return false;
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_SETTLEMENT_UNCONFIRMED");
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["released"]);
});

test("all ports fail closed in production, disabled or wrong project",async()=>{
  for(const change of [{enabled:false},{synthetic:false},{projectRef:"ufmhrmzumqkjvaezrmxf"}]){
    const x=scenario(change);
    await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_BILLING_DISABLED");
    assert.equal(x.calls.reserve.length,0);
  }
});


test("atomic claim simulation permits exactly one winner for simultaneous same-key requests",async()=>{
  const x=scenario();
  let claimed=false;
  x.simulation.creditPort.reserve=async key=>{
    x.calls.reserve.push(key);
    return {allowed:true,ledgerId:"ledger-00123",creditsRequired:1};
  };
  x.simulation.creditPort.claim=async (ledger,key)=>{
    x.calls.claim.push([ledger,key]);
    if(claimed)return false;
    claimed=true;
    return true;
  };
  const results=await Promise.allSettled([run(x.simulation),run(x.simulation)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.filter(r=>r.status==="rejected"&&r.reason.code==="CREDIT_CLAIM_REJECTED").length,1);
  assert.equal(x.calls.reserve.length,2,"idempotent reservation may be called twice for the same key");
  assert.deepEqual(x.calls.reserve,["case-00001234","case-00001234"]);
  assert.equal(x.calls.claim.length,2);
  assert.equal(x.calls.models.length,1,"only one claimant may incur a provider call");
  assert.deepEqual(x.calls.settle.map(r=>r[1]),["consumed"]);
});

test("claim transport ambiguity never sends inference or releases another claim",async()=>{
  const x=scenario();
  x.simulation.creditPort.claim=async()=>{
    throw new Error("unconfirmed database commit");
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_CLAIM_UNCONFIRMED");
  assert.equal(x.calls.reserve.length,1);
  assert.equal(x.calls.models.length,0);
  assert.equal(x.calls.settle.length,0);
});

test("reservation transport ambiguity never claims or invokes provider",async()=>{
  const x=scenario();
  x.simulation.creditPort.reserve=async()=>{throw new Error("synthetic network error");};
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_RESERVATION_UNCONFIRMED");
  assert.equal(x.calls.claim.length,0);
  assert.equal(x.calls.models.length,0);
  assert.equal(x.calls.settle.length,0);
});

test("cancellation after credit claim never retries Groq and releases once",async()=>{
  const x=scenario();
  x.simulation.invoke=async()=>runSdkSyntheticPilot({
    prompt:"SYNTHETIC: cancel this hypothetical task.",
    config:x.sdkConfig,record:async()=>{},
    generate:async({model,maxRetries})=>{
      assert.equal(maxRetries,0);
      x.calls.models.push(model.modelId);
      throw Object.assign(new Error("synthetic canceled"),{name:"AbortError",status:503});
    },
  });
  await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_EXECUTION_FAILED");
  assert.deepEqual(x.calls.models,["synthetic-openai-model"]);
  assert.deepEqual(x.calls.settle.map(r=>r[1]),["released"]);
});

test("persistence rejection occurs before consumed settlement; release is single",async()=>{
  const x=scenario({persist:async()=>{x.calls.persisted++;throw new Error("storage unavailable");}});
  await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_EXECUTION_FAILED");
  assert.equal(x.calls.validated,1);
  assert.equal(x.calls.persisted,1);
  assert.deepEqual(x.calls.settle.map(r=>r[1]),["released"]);
});

test("synthetic handoff orders reserve claim providers validation persistence and settle",async()=>{
  const events=[];
  const x=scenario();
  const creditPort={
    reserve:async key=>{events.push("reserve");return {allowed:true,ledgerId:"ledger-00123",creditsRequired:1};},
    claim:async()=>{events.push("claim");return true;},
    settle:async(_ledger,outcome)=>{events.push("settle:"+outcome);return {status:outcome,duplicate:false};},
  };
  const result=await run({...x.simulation,creditPort,
    invoke:async()=>{events.push("provider");return {provider:"openai",text:"synthetic output"};},
    validate:async()=>{events.push("validate");return true;},
    persist:async()=>{events.push("persist");return true;},
  });
  assert.equal(result.settlement,"consumed");
  assert.deepEqual(events,["reserve","claim","provider","validate","persist","settle:consumed"]);
});

test("real SDK HTTP OpenAI outage then Groq response consumes one simulation ledger",async()=>{
  const x=scenario();
  const requests=[];
  const output={
    id:"chatcmpl-synthetic",object:"chat.completion",created:1793000000,
    model:"openai/gpt-oss-120b",
    choices:[{index:0,message:{role:"assistant",content:"SYNTHETIC career summary"},finish_reason:"stop"}],
    usage:{prompt_tokens:8,completion_tokens:6,total_tokens:14},
  };
  x.simulation.invoke=async()=>runSdkSyntheticPilot({
    prompt:"SYNTHETIC: draft a fictional career plan.",
    config:x.sdkConfig,record:async()=>{},
    testOnlyFetch:async url=>{
      const hostname=new URL(url).hostname;
      requests.push(hostname);
      return hostname==="api.openai.com"
        ? new Response(JSON.stringify({error:{message:"temporary synthetic outage",type:"server_error",code:"server_error"}}),{status:503,headers:{"content-type":"application/json"}})
        : new Response(JSON.stringify(output),{status:200,headers:{"content-type":"application/json"}});
    },
  });
  const result=await run(x.simulation);
  assert.equal(result.provider,"groq");
  assert.deepEqual(requests,["api.openai.com","api.groq.com"]);
  assert.equal(x.calls.reserve.length,1);
  assert.equal(x.calls.claim.length,1);
  assert.deepEqual(x.calls.settle.map(r=>r[1]),["consumed"]);
});

test("failed Groq persistence after fallback never consumes the synthetic reservation",async()=>{
  const x=scenario({persist:async()=>false});
  x.simulation.invoke=async()=>runSdkSyntheticPilot({
    prompt:"SYNTHETIC: fictional career task.",
    config:x.sdkConfig,record:async()=>{},
    generate:async({model,maxRetries})=>{
      assert.equal(maxRetries,0);
      x.calls.models.push(model.modelId);
      if(x.calls.models.length===1)throw Object.assign(new Error("synthetic outage"),{status:503});
      return {text:"SYNTHETIC Groq result"};
    },
  });
  await assert.rejects(()=>run(x.simulation),e=>e.code==="SYNTHETIC_OUTPUT_NOT_PERSISTED");
  assert.deepEqual(x.calls.models,["synthetic-openai-model","openai/gpt-oss-120b"]);
  assert.deepEqual(x.calls.settle.map(r=>r[1]),["released"]);
});


test("settlement receipt with a conflicting status fails closed and is never retried",async()=>{
  const x=scenario();
  x.simulation.creditPort.settle=async(ledger,outcome,key)=>{
    x.calls.settle.push([ledger,outcome,key]);
    return {status:"released",duplicate:false};
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_SETTLEMENT_UNCONFIRMED");
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["consumed"]);
});

test("duplicate-settlement receipt requires reconciliation rather than assuming success",async()=>{
  const x=scenario();
  x.simulation.creditPort.settle=async(ledger,outcome,key)=>{
    x.calls.settle.push([ledger,outcome,key]);
    return {status:outcome,duplicate:true};
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_SETTLEMENT_UNCONFIRMED");
  assert.deepEqual(x.calls.settle.map(c=>c[1]),["consumed"]);
});

test("boolean settlement without sandbox RPC status is rejected",async()=>{
  const x=scenario();
  x.simulation.creditPort.settle=async(ledger,outcome,key)=>{
    x.calls.settle.push([ledger,outcome,key]);
    return true;
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="CREDIT_SETTLEMENT_UNCONFIRMED");
  assert.equal(x.calls.settle.length,1);
});


test("staff no-customer-credit authorization cannot be promoted to billable AI inference",async()=>{
  const x=scenario();
  x.simulation.creditPort.reserve=async key=>{
    x.calls.reserve.push(key);
    return {allowed:true,ledgerId:null,creditsRequired:0,reason:"internal_staff_usage_no_customer_credit"};
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="NON_BILLABLE_OPERATION_REQUIRES_SEPARATE_AUTH");
  assert.equal(x.calls.reserve.length,1);
  assert.equal(x.calls.claim.length,0);
  assert.equal(x.calls.models.length,0);
  assert.equal(x.calls.settle.length,0);
});

test("zero-cost plan operation cannot be treated as a paid credit reservation",async()=>{
  const x=scenario();
  x.simulation.creditPort.reserve=async key=>{
    x.calls.reserve.push(key);
    return {allowed:true,ledgerId:null,creditsRequired:0,reason:"no_customer_credit_required"};
  };
  await assert.rejects(()=>run(x.simulation),e=>e.code==="NON_BILLABLE_OPERATION_REQUIRES_SEPARATE_AUTH");
  assert.equal(x.calls.claim.length,0);
  assert.equal(x.calls.models.length,0);
  assert.equal(x.calls.settle.length,0);
});

test("missing or ambiguous credit cost must not invoke an AI provider",async()=>{
  for(const cost of [undefined,null,-1,0.5,NaN,Infinity]){
    const x=scenario();
    x.simulation.creditPort.reserve=async key=>{
      x.calls.reserve.push(key);
      return {allowed:true,ledgerId:"ledger-00123",creditsRequired:cost};
    };
    await assert.rejects(()=>run(x.simulation),e=>e.code==="CHARGEABLE_CREDIT_COST_UNCONFIRMED");
    assert.equal(x.calls.claim.length,0);
    assert.equal(x.calls.models.length,0);
    assert.equal(x.calls.settle.length,0);
  }
});

test("zero credit cost with a ledger ID cannot disguise a chargeable reservation",async()=>{
  const x=scenario();
  x.simulation.creditPort.reserve=async()=>({allowed:true,ledgerId:"ledger-00123",creditsRequired:0});
  await assert.rejects(()=>run(x.simulation),e=>e.code==="NON_BILLABLE_OPERATION_REQUIRES_SEPARATE_AUTH");
  assert.equal(x.calls.claim.length,0);
  assert.equal(x.calls.models.length,0);
  assert.equal(x.calls.settle.length,0);
});
