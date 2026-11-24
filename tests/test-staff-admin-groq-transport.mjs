import test from "node:test";
import assert from "node:assert/strict";
import { sendStaffAdminGroqRequest } from "../supabase/functions/careerdev-ai-agent-runtime/staff-admin-groq-transport.mjs";

const schema = {
  type: "object",
  properties: { risks: { type: "array", items: { type: "string" } }, actions: { type: "array", items: { type: "string" } }, insights: { type: "array", items: { type: "string" } } },
  required: ["risks", "actions", "insights"],
  additionalProperties: false,
};

test("sends a strict CEO JSON-schema request through the injected mock transport", async () => {
  let captured;
  const mockFetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({
      id: "mock-response-1",
      choices: [{ message: { content: JSON.stringify({ risks: ["Synthetic risk"], actions: ["Review evidence"], insights: ["Synthetic insight"] }) } }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const response = await sendStaffAdminGroqRequest({
    apiKey: "test-only-key-never-sent-to-network",
    fetchImpl: mockFetch,
    body: { model: "openai/gpt-oss-20b", messages: [{ role: "user", content: "synthetic" }], max_tokens: 1800, response_format: { type: "json_schema", json_schema: { name: "careerdev_staff_admin_agent_output", strict: true, schema } } },
  });

  assert.equal(captured.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers["Content-Type"], "application/json");
  assert.equal(captured.options.headers.Authorization, "Bearer test-only-key-never-sent-to-network");
  assert.ok(captured.options.signal instanceof AbortSignal);
  const sent = JSON.parse(captured.options.body);
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.deepEqual(sent.response_format.json_schema.schema.required, ["risks", "actions", "insights"]);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(await response.text()).usage, { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 });
});

test("rejects missing credentials before calling the transport", async () => {
  let called = false;
  assert.throws(() => sendStaffAdminGroqRequest({ apiKey: "", body: { model: "openai/gpt-oss-20b" }, fetchImpl: async () => { called = true; } }), /Groq API key is required/);
  assert.equal(called, false);
});

test("does not make a network request when the provider response is mocked", async () => {
  let called = 0;
  const response = await sendStaffAdminGroqRequest({ apiKey: "synthetic", body: { model: "openai/gpt-oss-20b" }, fetchImpl: async () => { called += 1; return new Response("{}", { status: 429 }); } });
  assert.equal(called, 1);
  assert.equal(response.status, 429);
  assert.equal(await response.text(), "{}");
});
