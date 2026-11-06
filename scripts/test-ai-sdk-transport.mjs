import test from "node:test";
import assert from "node:assert/strict";
import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { runSdkSyntheticPilot } from "../lib/ai/pilot/sdk-executor.mjs";

/**
 * Exercises the REAL AI SDK HTTP request/response parsing with injected local
 * fake transport. No API keys, real network calls or billable completions.
 */
const jsonResponse=(payload,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{"content-type":"application/json"},
});
const groqFixture={
  id:"chatcmpl-synthetic",object:"chat.completion",created:1793000000,
  model:"openai/gpt-oss-120b",
  choices:[{index:0,message:{role:"assistant",content:"Synthetic career analysis result"},finish_reason:"stop"}],
  usage:{prompt_tokens:9,completion_tokens:5,total_tokens:14},
};
const openaiFixture={
  id:"resp_synthetic",object:"response",created_at:1793000000,
  status:"completed",model:"synthetic-test-openai",
  output:[{
    type:"message",id:"msg_synthetic",status:"completed",role:"assistant",
    content:[{type:"output_text",text:"Synthetic OpenAI career analysis",annotations:[]}],
  }],
  usage:{input_tokens:8,output_tokens:6,total_tokens:14},
};
const invoke=async model=>generateText({
  model,
  prompt:"SYNTHETIC: describe skills required for a fictional data analyst.",
  maxOutputTokens:200,
  maxRetries:0,
  abortSignal:AbortSignal.timeout(5000),
});

test("real Groq SDK serializes a chat request, parses a local mock reply, and sends exactly once",async()=>{
  const seen=[];
  const groq=createGroq({
    apiKey:"synthetic-key-never-sent",
    fetch:async(url,request)=>{
      seen.push({url:String(url),method:request?.method,body:JSON.parse(request.body)});
      return jsonResponse(groqFixture);
    },
  });
  const output=await invoke(groq("openai/gpt-oss-120b"));
  assert.equal(output.text,"Synthetic career analysis result");
  assert.equal(seen.length,1);
  assert.equal(seen[0].method,"POST");
  assert.ok(seen[0].url.startsWith("https://api.groq.com/openai/v1/"));
  assert.equal(seen[0].body.model,"openai/gpt-oss-120b");
  assert.notEqual(seen[0].body.stream,true,"non-streaming request must not enable streaming");
});

test("real OpenAI SDK serializes a Responses request and parses one synthetic reply",async()=>{
  const seen=[];
  const openai=createOpenAI({
    apiKey:"synthetic-openai-key-never-sent",
    fetch:async(url,request)=>{
      seen.push({url:String(url),method:request?.method,body:JSON.parse(request.body)});
      return jsonResponse(openaiFixture);
    },
  });
  const output=await invoke(openai("synthetic-test-openai"));
  assert.equal(output.text,"Synthetic OpenAI career analysis");
  assert.equal(seen.length,1);
  assert.equal(seen[0].method,"POST");
  assert.ok(seen[0].url.startsWith("https://api.openai.com/v1/"));
  assert.equal(seen[0].body.model,"synthetic-test-openai");
});

test("Groq HTTP 503 is not retried by SDK when maxRetries is zero",async()=>{
  let calls=0;
  const groq=createGroq({
    apiKey:"synthetic",
    fetch:async()=>{calls++;return jsonResponse({
      error:{message:"synthetic provider unavailable",type:"server_error",code:"server_error"}
    },503);},
  });
  await assert.rejects(()=>invoke(groq("openai/gpt-oss-120b")));
  assert.equal(calls,1);
});

test("OpenAI HTTP 429 quota failure is not retried by SDK",async()=>{
  let calls=0;
  const openai=createOpenAI({
    apiKey:"synthetic",
    fetch:async()=>{calls++;return jsonResponse({
      error:{message:"synthetic quota exhausted",type:"insufficient_quota",code:"insufficient_quota"}
    },429);},
  });
  await assert.rejects(()=>invoke(openai("synthetic-test-openai")));
  assert.equal(calls,1);
});

const isolatedPilot={
  enabled:true,environment:"isolated-test",
  openaiKey:"synthetic-openai-key",groqKey:"synthetic-groq-key",
  openaiModelId:"synthetic-test-openai",groqModelId:"openai/gpt-oss-120b",
  openaiModelAllowlist:["synthetic-test-openai"],
  groqModelAllowlist:["openai/gpt-oss-120b"],
  groqFallbackEnabled:true,
};

test("complete isolated adapter makes exactly one OpenAI call then one Groq fallback",async()=>{
  const requests=[],events=[];
  const result=await runSdkSyntheticPilot({
    prompt:"SYNTHETIC: create a fictional skills roadmap without external claims.",
    config:isolatedPilot,
    record:async event=>events.push(event),
    testOnlyFetch:async(url,init)=>{
      requests.push({url:String(url),method:init.method});
      return String(url).includes("api.openai.com")
        ? jsonResponse({error:{message:"mock temporary outage",type:"server_error",code:"server_error"}},503)
        : jsonResponse(groqFixture);
    },
  });
  assert.equal(result.provider,"groq");
  assert.equal(result.attempts,2);
  assert.deepEqual(requests.map(x=>x.url.includes("api.openai.com")?"openai":"groq"),["openai","groq"]);
  assert.deepEqual(events.map(x=>x.outcome),["transient_failure","success"]);
  assert.ok(events.every(x=>!("prompt" in x)&&!("text" in x)));
});

test("complete isolated adapter never retries or switches provider on quota exhaustion",async()=>{
  const urls=[],events=[];
  await assert.rejects(()=>runSdkSyntheticPilot({
    prompt:"SYNTHETIC: hypothetical career task.",
    config:isolatedPilot,
    record:async e=>events.push(e),
    testOnlyFetch:async(url)=>{
      urls.push(String(url));
      return jsonResponse({error:{message:"mock quota exhausted",type:"insufficient_quota",code:"insufficient_quota"}},429);
    },
  }),e=>e.message==="PILOT_PROVIDER_FAILED");
  assert.equal(urls.length,1);
  assert.ok(urls[0].includes("api.openai.com"));
  assert.deepEqual(events.map(x=>x.outcome),["permanent_failure"]);
});

test("complete isolated adapter leaves fallback unused when OpenAI reply succeeds",async()=>{
  const urls=[];
  const result=await runSdkSyntheticPilot({
    prompt:"SYNTHETIC: fictional career skills analysis.",
    config:isolatedPilot,
    record:async()=>{},
    testOnlyFetch:async(url)=>{
      urls.push(String(url));
      return jsonResponse(openaiFixture);
    },
  });
  assert.equal(result.provider,"openai");
  assert.equal(result.attempts,1);
  assert.equal(urls.length,1);
  assert.ok(urls[0].includes("api.openai.com"));
});
