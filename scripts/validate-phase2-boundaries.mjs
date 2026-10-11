import { readFileSync } from "node:fs";

const page = readFileSync("app/coach-matching/page.tsx", "utf8");
const requiredPatterns = [
  ["goal input maximum", "MAX_GOAL_LENGTH=4000"],
  ["signal input maximum", "MAX_SIGNALS=10"],
  ["native goal maxlength", "maxLength={MAX_GOAL_LENGTH}"],
  ["normalized goal payload", "normalizedGoal"],
  ["normalized signal payload", "normalizedSignals"],
  ["stable public error", "PUBLIC_MATCHING_ERROR"],
];
for (const [label, pattern] of requiredPatterns) {
  if (!page.includes(pattern)) throw new Error(`Missing Phase 2 boundary control: ${label}`);
}
if (page.includes("setError(err instanceof Error?err.message")) {
  throw new Error("Public coach matching must not render raw exception messages.");
}
if (page.includes("detail:") || page.includes("candidateError.message")) {
  throw new Error("Public coach matching client must not expose backend error detail fields.");
}
console.log("Phase 2 boundary validation passed: bounded coach input and stable public errors are present.");
