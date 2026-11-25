import test from "node:test";
import assert from "node:assert/strict";
import {
  SYNTHETIC_AGENT_ID, PilotPolicyError, PilotProviderError,
  isTransientProviderError, runSyntheticProviderPilot,
} from "../lib/ai/pilot/provider-routing.mjs";

function base(overrides = {}) {
  return {
    enabled: true, requestId: "test-case-1234",
    agentId: SYNTHETIC_AGENT_ID, synthetic: true,
    prompt: "SYNTHETIC: A graduate is exploring data analysis.",
    primary: {provider: "openai", modelId: "approved-openai-test-model"},
    fallback: {provider: "groq", modelId: "openai/gpt-oss-120b"},
    fallbackEnabled: true,
    invoke: async () => ({text: "Synthetic example response"}),
    ...overrides,
  };
}

test("closed when feature flag is off", async () => {
  let calls = 0;
  await assert.rejects(() => runSyntheticProviderPilot(base({
    enabled: false, invoke: async () => {calls++; return {text:"bad"};},
  })), e => e instanceof PilotPolicyError && e.code === "PILOT_DISABLED");
  assert.equal(calls, 0);
});

test("refuses production/unauthorized agent or missing synthetic marker", async () => {
  for (const change of [{synthetic:false}, {agentId:"career-discovery"}, {agentId:"client-agent"}]) {
    await assert.rejects(() => runSyntheticProviderPilot(base(change)),
      e => e.code === "SYNTHETIC_ONLY");
  }
});

test("requires bounded prompt, request ID, approved model and executor", async () => {
  const invalid = [
    [{prompt:""}, "INVALID_PROMPT_SIZE"],
    [{prompt:"X".repeat(2001)}, "INVALID_PROMPT_SIZE"],
    [{requestId:"bad"}, "INVALID_REQUEST_ID"],
    [{primary:{provider:"groq", modelId:"openai/gpt-oss-120b"}}, "UNAPPROVED_PROVIDER_MODEL"],
    [{fallback:{provider:"custom", modelId:"fake-model"}}, "UNAPPROVED_PROVIDER_MODEL"],
    [{invoke:null}, "MISSING_PROVIDER_EXECUTOR"],
  ];
  for (const [change, code] of invalid) {
    await assert.rejects(() => runSyntheticProviderPilot(base(change)), e => e.code === code);
  }
});

test("primary success does not trigger Groq, and records metadata only", async () => {
  const invoked = [], metrics = [];
  const result = await runSyntheticProviderPilot(base({
    invoke: async args => {invoked.push(args.provider); return {text:"approved",usage:{inputTokens:12}};},
    record: async item => {metrics.push(item);},
  }));
  assert.deepEqual(invoked, ["openai"]);
  assert.equal(result.provider, "openai");
  assert.equal(result.attempts, 1);
  assert.equal(metrics[0].outcome, "success");
  assert.equal(Object.prototype.hasOwnProperty.call(metrics[0],"prompt"),false);
  assert.equal(Object.prototype.hasOwnProperty.call(metrics[0],"text"),false);
});

test("transient 503 triggers exactly one approved Groq fallback", async () => {
  const invoked = [], metrics = [];
  const output = await runSyntheticProviderPilot(base({
    invoke: async args => {
      invoked.push(args.provider);
      if (args.provider === "openai") throw Object.assign(new Error("sensitive"), {status:503});
      return {text:"synthetic fallback response"};
    },
    record: async event => {metrics.push(event.outcome);},
  }));
  assert.deepEqual(invoked, ["openai", "groq"]);
  assert.deepEqual(metrics, ["transient_failure", "success"]);
  assert.equal(output.attempts, 2);
  assert.equal(output.provider, "groq");
});

test("401 and 400 never fallback", async () => {
  for (const status of [400, 401, 403, 422]) {
    let calls = 0;
    await assert.rejects(() => runSyntheticProviderPilot(base({
      invoke: async () => {calls++; throw Object.assign(new Error("secrets"), {status});},
    })), e => e instanceof PilotProviderError && e.message === "PILOT_PROVIDER_FAILED");
    assert.equal(calls, 1);
  }
});

test("transient failures do not fallback when not explicitly enabled", async () => {
  let calls = 0;
  await assert.rejects(() => runSyntheticProviderPilot(base({
    fallbackEnabled:false,
    invoke: async () => {calls++; throw Object.assign(new Error("oops"), {status:503});},
  })), e => e instanceof PilotProviderError);
  assert.equal(calls, 1);
});

test("invalid provider output is rejected, not retried", async () => {
  let calls = 0;
  await assert.rejects(() => runSyntheticProviderPilot(base({
    invoke: async () => {calls++; return {text:"  "};},
  })), e => e.code === "INVALID_PROVIDER_OUTPUT");
  assert.equal(calls, 1);
});

test("both provider failures return sanitized error", async () => {
  let calls = 0;
  await assert.rejects(() => runSyntheticProviderPilot(base({
    invoke: async () => {calls++; throw Object.assign(new Error("do not disclose this"), {status:503});},
  })), e => e.message === "PILOT_PROVIDER_FAILED" && !e.message.includes("disclose"));
  assert.equal(calls, 2);
});

test("transient classifier requires verified retryable signals", () => {
  assert.equal(isTransientProviderError({status:429}), false);
  assert.equal(isTransientProviderError({status:429,error:{code:"rate_limit_exceeded"}}), true);
  assert.equal(isTransientProviderError({status:429,headers:{"retry-after":"3"}}), true);
  assert.equal(isTransientProviderError({status:429,responseHeaders:new Headers({"retry-after":"2"})}), true);
  assert.equal(isTransientProviderError({name:"AbortError",status:503}), false);
  assert.equal(isTransientProviderError({name:"TimeoutError"}), true);
  assert.equal(isTransientProviderError({code:"ETIMEDOUT"}), true);
  assert.equal(isTransientProviderError({status:401}), false);
  assert.equal(isTransientProviderError(new Error("unknown")), false);
});

test("account credit exhaustion and spend limits never trigger Groq", async () => {
  const fatalCodes=[
    "insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded", "organization_usage_limit_exceeded",
    "billing_hard_limit_reached",
  ];
  for (const code of fatalCodes) {
    let calls=0;
    await assert.rejects(() => runSyntheticProviderPilot(base({
      invoke: async () => {
        calls++;
        throw Object.assign(new Error("untrusted sensitive text"), {
          status:429, error:{code}, headers:{"retry-after":"1"},
        });
      },
    })), e => e instanceof PilotProviderError);
    assert.equal(calls,1,"quota failure may not consume second provider call: "+code);
  }
});

test("nested AI SDK quota body blocks fallback even when error status is 503", async () => {
  let calls=0;
  await assert.rejects(() => runSyntheticProviderPilot(base({
    invoke: async () => {
      calls++;
      throw Object.assign(new Error("API failed"), {
        statusCode:503,
        responseBody:JSON.stringify({error:{code:"insufficient_quota"}}),
      });
    },
  })), e=>e.message==="PILOT_PROVIDER_FAILED");
  assert.equal(calls,1);
});

test("user-initiated cancellation does not reissue a paid provider request", async () => {
  let calls=0;
  await assert.rejects(() => runSyntheticProviderPilot(base({
    invoke: async () => {
      calls++;
      throw Object.assign(new Error("cancelled by caller"),{name:"AbortError",status:503});
    },
  })), e=>e instanceof PilotProviderError);
  assert.equal(calls,1);
});

test("failed metrics writer never returns unrecorded output", async () => {
  await assert.rejects(() => runSyntheticProviderPilot(base({
    record: async () => {throw new Error("audit sink unavailable");},
  })), /audit sink unavailable/);
});
