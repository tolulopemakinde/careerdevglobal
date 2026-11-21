import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261121130000_ai_agent_pilot_access.sql", import.meta.url), "utf8");
const runtime = await readFile(new URL("../supabase/functions/careerdev-ai-agent-runtime/index.ts", import.meta.url), "utf8");
const agentsPage = await readFile(new URL("../app/agents/page.tsx", import.meta.url), "utf8");
const careerResearchPage = await readFile(new URL("../app/career-research/research-workspace.tsx", import.meta.url), "utf8");
const careerResearchFunction = await readFile(new URL("../supabase/functions/careerdev-career-research/index.ts", import.meta.url), "utf8");
const careerCoachPanel = await readFile(new URL("../app/career-intelligence/career-coach-panel.tsx", import.meta.url), "utf8");

test("pilot access is disabled by default and time-bounded", () => {
  assert.match(migration, /values\s*\(true,\s*false,\s*null\)/i);
  assert.match(migration, /pilot\.ends_at\s*>\s*now\(\)/i);
  assert.match(migration, /u\s*=\s*any\(coalesce\(pilot\.participant_ids/i);
  assert.match(migration, /role_name\s+in\s*\('client',\s*'coach'\)/i);
  assert.match(migration, /role_name\s+is\s+distinct\s+from\s+'admin'/i);
  assert.match(migration, /p_ends_at\s*>\s*now\(\)\s*\+\s*interval\s+'3 months'/i);
  assert.match(migration, /create or replace function public\.request_ai_agent_execution/i);
  assert.match(migration, /public\.get_my_ai_agent_access\(a\.agent_key\)/i);
});

test("paid entitlement checks and request RPC defaults are preserved", () => {
  assert.match(migration, /pg_catalog\.to_regprocedure\('public\.ai_payment_access_allowed\(uuid\)'\)/i);
  assert.match(migration, /execute\s+'select public\.ai_payment_access_allowed\(\$1\)'/i);
  assert.match(migration, /public\.ai_agent_subscription_payment_access_allowed\(s\.id\)/i);
  assert.match(migration, /s\.current_period_start\s*<=\s*now\(\)/i);
  assert.match(migration, /p_workflow_key\s+text\s+default\s+null,\s*p_trigger_source\s+text\s+default\s+'manual'/i);
});

test("pilot access is limited to the 11 no-AI or AI-optional agents", () => {
  const keys = [...migration.matchAll(/^\s*'([a-z_]+_agent)'\s*,?$/gm)].map((match) => match[1]);
  assert.equal(new Set(keys).size, 11);
  assert.match(migration, /ai_dependency_mode\s+in\s*\('works_without_ai',\s*'ai_optional'\)/i);
});

test("AI-optional executions return the structured fallback when credits or provider are unavailable", () => {
  assert.match(runtime, /dependencyMode==='ai_optional'\)\s*creditFallbackReason=/);
  assert.match(runtime, /dependencyMode==='ai_optional'\s*&&\s*\(!openaiKey\s*\|\|\s*creditFallbackReason\)/);
  assert.match(runtime, /if\(dependencyMode==='ai_optional'\) return await persistStructuredFallback/);
});

test("agent directory uses the access RPC for pilot visibility", () => {
  assert.match(agentsPage, /get_my_ai_agent_access/);
  assert.match(agentsPage, /pilotAgents\.has\(agent\.agent_key\)/);
});

test("Career Research page recognizes pilot entitlement", () => {
  assert.match(careerResearchPage, /get_my_ai_agent_access/);
  assert.match(careerResearchPage, /row\?\.status === "pilot"/);
  assert.match(careerResearchPage, /PILOT STRUCTURED BASELINE/);
});

test("guided Career Coach uses the pilot-aware access RPC", () => {
  assert.match(careerCoachPanel, /get_my_ai_agent_access/);
  assert.match(careerCoachPanel, /row\?\.status === "pilot"/);
});

test("Career Research emits a persisted no-provider fallback when pilot credits are unavailable", () => {
  assert.match(careerResearchFunction, /if \(!reserveError && pilotAccess\)/);
  assert.match(careerResearchFunction, /buildPilotResearchFallback\(input\)/);
  assert.match(careerResearchFunction, /ai_provider_called: false/);
  assert.match(careerResearchFunction, /status: "awaiting_human_review"/);
  assert.match(careerResearchFunction, /assertFreeProvider\(\);\s*const search = await searchWeb/);
  assert.match(careerResearchFunction, /event_type: "completed"[\s\S]*ai_provider_called: false/);
});
