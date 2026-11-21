import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261121130000_ai_agent_pilot_access.sql", import.meta.url), "utf8");
const runtime = await readFile(new URL("../supabase/functions/careerdev-ai-agent-runtime/index.ts", import.meta.url), "utf8");
const agentsPage = await readFile(new URL("../app/agents/page.tsx", import.meta.url), "utf8");

test("pilot access is disabled by default and time-bounded", () => {
  assert.match(migration, /values\s*\(true,\s*false,\s*null\)/i);
  assert.match(migration, /pilot\.ends_at\s*>\s*now\(\)/i);
  assert.match(migration, /u\s*=\s*any\(coalesce\(pilot\.participant_ids/i);
  assert.match(migration, /role_name\s+in\s*\('client',\s*'coach'\)/i);
  assert.match(migration, /role_name\s+is\s+distinct\s+from\s+'admin'/i);
  assert.match(migration, /p_ends_at\s*>\s*now\(\)\s*\+\s*interval\s+'3 months'/i);
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
