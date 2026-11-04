import test from "node:test";
import assert from "node:assert/strict";
import {runSyntheticCreditHandoff} from "../lib/ai/pilot/credit-handoff-simulation.mjs";
import {runSdkSyntheticPilot} from "../lib/ai/pilot/sdk-executor.mjs";

function scenario(overrides={}){
  const calls={reserve:[],claim:[],settle:[],models:[],validated:0,persisted:0};
  const creditPort={
    reserve:async key=>{calls.reserve.push(key);return {allowed:true,ledgerId:"ledger-00123"};},
    claim:async(ledger,key)=>{calls.claim.push([ledger,key]);return true;},
    settle:async(ledger,outcome,key)=>{calls.settle.push([ledger,outcome,key]);return true;},
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
