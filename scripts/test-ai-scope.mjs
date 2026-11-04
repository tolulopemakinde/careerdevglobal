import test from "node:test";
import assert from "node:assert/strict";
import {forbiddenAiPilotChanges} from "../scripts/validate-ai-pilot-scope.mjs";
test("allows only draft AI adapter, docs, tests and package lockfile",()=>{
 const paths=[
   ".github/workflows/phase1-validation.yml",
   "package.json","package-lock.json",
   "lib/ai/pilot/sdk-executor.mjs",
   "scripts/test-ai-provider-pilot.mjs",
   "docs/architecture/approved-high-priority-ai-integrations-2026-11-04.md",
   "examples/ai-pilot/sdk-executor.example.mjs",
   "scripts/run-ai-model-connectivity.mjs",
   "scripts/validate-ai-pilot-scope.mjs",
 ];
 assert.deepEqual(forbiddenAiPilotChanges(paths),[]);
});
test("rejects live Supabase runtime and billing migrations",()=>{
 assert.deepEqual(forbiddenAiPilotChanges([
 "supabase/functions/careerdev-ai-agent-runtime/index.ts",
 "supabase/migrations/20261104000000_change_credits.sql",
 "lib/ai-billing-lifecycle.mjs",
 ]),[
 "supabase/functions/careerdev-ai-agent-runtime/index.ts",
 "supabase/migrations/20261104000000_change_credits.sql",
 "lib/ai-billing-lifecycle.mjs",
 ]);
});
test("rejects application UI/routes and unrelated workflows",()=>{
 assert.equal(forbiddenAiPilotChanges(["app/api/ai/route.ts","app/pricing/page.tsx",".github/workflows/deploy.yml"]).length,3);
});
test("rejects paths outside relative repository tree",()=>{
 assert.deepEqual(forbiddenAiPilotChanges(["../secrets","/tmp/secret"]),["../secrets","/tmp/secret"]);
});
