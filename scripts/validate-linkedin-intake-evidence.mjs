import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const sourcePath = resolve("supabase/functions/careerdev-intake-engine-v2/index.ts");
const source = readFileSync(sourcePath, "utf8");

const checks = [
  ["request authorization uses the explicit policy helper", /canAccessIntakeRequest\(actor,\{clientProfileId:cl\.profile_id,assignedCoachId:r\.assigned_coach\}\)/],
  ["no unauthorized role is granted request access", !/!\[['"]coach['"],['"]staff['"],['"]admin['"]\]\.includes\(actor\.role\)/.test(source)],
  ["budget check errors are reported as blocked", /status:"blocked",reason:"AI_BUDGET_CHECK_FAILED"/],
  ["budget exhaustion is not reported as queued", /status:"blocked",reason:"AI_BUDGET_BLOCKED"/],
  ["provider configuration errors are reported as blocked", /status:"blocked",reason:"AI_PROVIDER_NOT_CONFIGURED"/],
  ["provider credit failures are not reported as queued", /status:'blocked',reason:code/],
  ["no intake failure claims it was queued", !/status\s*:\s*["']queued["']/.test(source)],
  ["document evidence query is scoped to the current request", /from\(["']document_processing_jobs["']\)[\s\S]{0,500}\.eq\(["']request_id["'],\s*request_id\)/],
  ["only completed document processing is included", /from\(["']document_processing_jobs["']\)[\s\S]{0,600}\.eq\(["']status["'],\s*["']completed["']\)/],
  ["retrieval is restricted to documents attached to the request", /\.in\(["']document_id["'],\s*\(docs\?\?\[\]\)\.map\(\(d:any\)=>d\.id\)\)/],
  ["retrieval is explicitly scoped to the owning client", /\.eq\(["']client_id["'],\s*r\.client_id\)/],
  ["retrieval failures return an explicit blocked response without claiming a persisted queue", /status:"blocked",reason:"DOCUMENT_EVIDENCE_RETRIEVAL_FAILED",message:"[^"]*No automatic retry has been recorded[^"]*",human_review_required:true,next_action:[\s\S]{0,300}\},503\)/],
  ["each extracted document is length-bounded", /job\.extracted_text\.slice\(0,Math\.min\(8000,40000-totalEvidenceChars\)\)/],
  ["total extracted evidence is bounded", /totalEvidenceChars<40000/],
  ["the number of documents passed to the model is bounded", /document_evidence:\s*Array\.from\(evidenceByDocument\.values\(\)\)\.slice\(0,10\)/],
  ["the prompt warns against repeated questions", /semantically[\s\S]{0,180}duplicates|Avoid exact and semantic duplicates/i],
  ["human review remains required for uncertain cases", /human_review_required:\s*true/],
];

let failed = false;
for (const [label, check] of checks) {
  const passed = check instanceof RegExp ? check.test(source) : check;
  console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
  if (!passed) failed = true;
}
assert.equal(failed, false, "LinkedIn intake evidence static checks failed.");
console.log("LinkedIn intake evidence checks passed. Authenticated integration scenarios remain separate.");
