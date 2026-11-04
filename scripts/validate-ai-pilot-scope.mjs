/**
 * Review-only change boundary for Draft PR #43.
 * Fails CI if this branch modifies live routes, Supabase functions/migrations,
 * production billing, subscription UI or other unrelated application code.
 *
 * This does not replace an approval check or protect after merging.
 */
import {spawnSync} from "node:child_process";
export function forbiddenAiPilotChanges(paths) {
  if(!Array.isArray(paths))throw new TypeError("paths must be an array");
  const allowed = p => p===".github/workflows/phase1-validation.yml" ||
    p==="package.json" || p==="package-lock.json" ||
    p==="scripts/run-ai-model-connectivity.mjs" ||
    p==="scripts/validate-ai-pilot-scope.mjs" ||
    p.startsWith("scripts/test-ai-") ||
    p.startsWith("lib/ai/pilot/") ||
    p.startsWith("examples/ai-pilot/") ||
    p.startsWith("docs/architecture/");
  return paths.filter(p=>typeof p!=="string" ||
    p.startsWith("/") || p.includes("..") || !allowed(p));
}
export function checkAiPilotScope() {
  const r=spawnSync("git",["diff","--name-only","--diff-filter=ACDMR",
    "origin/main...HEAD"],{encoding:"utf8",timeout:12000});
  if(r.error || r.status!==0)throw new Error("AI_PILOT_DIFF_UNAVAILABLE");
  const paths=r.stdout.trim().split("\n").filter(Boolean);
  if(paths.length===0)throw new Error("AI_PILOT_DIFF_EMPTY");
  const forbidden=forbiddenAiPilotChanges(paths);
  if(forbidden.length){
    // File paths are not provider secrets, but remain brief in CI logs.
    throw new Error("AI_PILOT_SCOPE_VIOLATION: "+forbidden.join(", "));
  }
  return {changedFiles:paths.length,scope:"ISOLATED_AI_PILOT_ONLY"};
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href){
  try{console.log(JSON.stringify(checkAiPilotScope()));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
