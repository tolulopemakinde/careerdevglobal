import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { runSdkSyntheticPilot } from "../lib/ai/pilot/sdk-executor.mjs";

const base = (extra={}) => ({
  prompt:"SYNTHETIC: test career-switching advice for a fictional graduate.",
  config:{
    enabled:true, environment:"isolated-test",
    openaiKey:"dummy-no-network-openai",
    groqKey:"dummy-no-network-groq",
    openaiModelId:"synthetic-openai-model",
    groqModelId:"openai/gpt-oss-120b",
    openaiModelAllowlist:["synthetic-openai-model"],
    groqModelAllowlist:["openai/gpt-oss-120b"],
    groqFallbackEnabled:true,
  },
  record:async()=>{},
  generate:async()=>({text:"Synthetic generated response",usage:{inputTokens:4,outputTokens:5}}),
  ...extra,
});

test("actual AI SDK packages expose expected public functions", () => {
  assert.equal(typeof generateText,"function");
  assert.equal(typeof createOpenAI,"function");
  assert.equal(typeof createGroq,"function");
  assert.equal(createOpenAI({apiKey:"dummy-key"})("synthetic-openai-model").modelId,"synthetic-openai-model");
  assert.equal(createGroq({apiKey:"dummy-key"})("openai/gpt-oss-120b").modelId,"openai/gpt-oss-120b");
});

test("SDK pilot refuses default-off feature gate", async () => {
  await assert.rejects(
    () => runSdkSyntheticPilot(base({config:{...base().config,enabled:false}})),
    e=>e.code==="PILOT_DISABLED",
  );
});

test("SDK pilot requires an audit writer", async () => {
  await assert.rejects(() => runSdkSyntheticPilot(base({record:null})),
    e=>e.code==="AUDIT_WRITER_REQUIRED");
});

test("SDK pilot requires allowlisted primary model", async () => {
  await assert.rejects(() => runSdkSyntheticPilot(base({
    config:{...base().config,openaiModelAllowlist:["other"]},
  })),e=>e.code==="PRIMARY_PROVIDER_NOT_CONFIGURED");
});

test("SDK pilot enforces explicit test environment", async () => {
  await assert.rejects(() => runSdkSyntheticPilot(base({
    config:{...base().config,environment:"production"},
  })),e=>e.code==="PILOT_DISABLED");
});

test("SDK routes through real provider constructors with mocked, non-network generation", async () => {
  const invoked=[];
  const result=await runSdkSyntheticPilot(base({
    generate:async input=>{
      assert.equal(input.maxRetries,0,"SDK must not perform hidden retries");
      assert.equal(input.maxOutputTokens,400);
      invoked.push(input.model.modelId);
      return {text:"Synthesized test-only result",usage:{inputTokens:6,outputTokens:7}};
    },
  }));
  assert.deepEqual(invoked,["synthetic-openai-model"]);
  assert.equal(result.provider,"openai");
  assert.equal(result.usage.outputTokens,7);
});

test("SDK falls back once on transient failure and records two provider events", async () => {
  const models=[],audit=[];
  const output=await runSdkSyntheticPilot(base({
    record:async x=>audit.push(x.outcome),
    generate:async input=>{
      assert.equal(input.maxRetries,0,"each provider attempt must be non-retrying");
      models.push(input.model.modelId);
      if(models.length===1) throw Object.assign(new Error("simulated"),{statusCode:503});
      return {text:"synthetic Groq fallback result",usage:{}};
    },
  }));
  assert.deepEqual(models,["synthetic-openai-model","openai/gpt-oss-120b"]);
  assert.deepEqual(audit,["transient_failure","success"]);
  assert.equal(output.provider,"groq");
});

test("SDK pilot never calls provider on invalid test prompt", async () => {
  let generated=false;
  await assert.rejects(() => runSdkSyntheticPilot(base({
    prompt:"",
    generate:async()=>{generated=true;return {text:"unexpected"};},
  })),e=>e.code==="INVALID_PROMPT_SIZE");
  assert.equal(generated,false);
});
