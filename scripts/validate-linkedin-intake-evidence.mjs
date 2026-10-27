import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const sourcePath = resolve("supabase/functions/careerdev-intake-engine-v2/index.ts");
const source = readFileSync(sourcePath, "utf8");

const checks = [
  ["document evidence query is scoped to the current request", /from\(["']document_processing_jobs["']\)[\s\S]{0,500}\.eq\(["']request_id["'],\s*request_id\)/],
  ["only completed document processing is included", /from\(["']document_processing_jobs["']\)[\s\S]{0,600}\.eq\(["']status["'],\s*["']completed["']\)/],
  ["retrieval is restricted to documents attached to the request", /\.in\(["']document_id["'],\s*\(docs\?\?\[\]\)\.map\(\(d:any\)=>d\.id\)\)/],
  ["retrieval is explicitly scoped to the owning client", /\.eq\(["']client_id["'],\s*r\.client_id\)/],
  ["retrieval failures queue safely instead of silently dropping evidence", /documentEvidenceResult\.error\)return json\([\s\S]{0,450}DOCUMENT_EVIDENCE_RETRIEVAL_FAILED/],
  ["each extracted document is length-bounded", /job\.extracted_text\.slice\(0,Math\.min\(8000,40000-totalEvidenceChars\)\)/],
  ["total extracted evidence is bounded", /totalEvidenceChars<40000/],
  ["the number of documents passed to the model is bounded", /document_evidence:\s*Array\.from\(evidenceByDocument\.values\(\)\)\.slice\(0,10\)/],
  ["the model receives the document evidence field", /document_evidence:\s*Array\.from\(evidenceByDocument\.values\(\)\)\.slice\(0,10\)/],
  ["the prompt warns against repeated questions", /semantically[\s\S]{0,180}duplicates|Avoid exact and semantic duplicates/i],
  ["human review remains required for uncertain cases", /human_review_required:\s*true/],
];

let failed = false;
for (const [label, pattern] of checks) {
  const passed = pattern.test(source);
  console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
  if (!passed) failed = true;
}
assert.equal(failed, false, "LinkedIn intake evidence static checks failed.");
console.log("LinkedIn intake evidence static checks passed. These checks do not replace runtime or authorization tests.");
