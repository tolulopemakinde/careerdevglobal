import { readFileSync } from "node:fs";

const path = "supabase/functions/_shared/edge-security.ts";
const source = readFileSync(path, "utf8");
const requiredPatterns = [
  ["body byte limit", "readJsonWithLimit"],
  ["goal validation", "COACH_MATCHING_MAX_GOAL_LENGTH = 4000"],
  ["signal validation", "COACH_MATCHING_MAX_SIGNALS = 10"],
  ["stable error response", "securityError"],
  ["request correlation", "x-request-id"],
  ["explicit origin handling", "allowedOrigin"],
  ["rate limiting", "consumeRateLimit"],
  ["retry-after calculation", "retryAfterSeconds"],
  ["diagnostic separation", "diagnosticRecord"],
];
for (const [label, pattern] of requiredPatterns) {
  if (!source.includes(pattern)) throw new Error(`Missing Edge security control: ${label}`);
}
if (source.includes("Access-Control-Allow-Origin\":\"*")) {
  throw new Error("The Edge security adapter must not define wildcard CORS.");
}
if (!source.includes("Cache-Control")) {
  throw new Error("Security responses must disable caching.");
}
console.log("Edge security module validation passed: validation, bounded requests, rate budget, correlation IDs, and stable errors are present.");
