import test from "node:test";
import assert from "node:assert/strict";
import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";

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
  assert.equal(seen[0].body.stream,false);
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
