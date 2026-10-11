import { readFileSync } from "node:fs";

const path = "supabase/functions/_shared/edge-security.ts";
const source = readFileSync(path, "utf8");
const handlerPath = "supabase/functions/careerdev-coach-matching/index.ts";
const handler = readFileSync(handlerPath, "utf8");
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
  ["bounded bucket map", "RATE_LIMIT_MAX_BUCKETS = 10_000"],
  ["preflight support", "preflightResponse"],
  ["empty preflight body", "new Response(null, { status: 204"],
  ["retry-after header", 'headers.set("Retry-After"'],
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
for (const pattern of [
  "../_shared/edge-security.ts",
  "readJsonWithLimit",
  "validateCoachMatchingInput",
  "consumeRateLimit",
  "preflightResponse",
  "diagnosticRecord",
  "securityError(\"INTERNAL_ERROR\"",
]) {
  if (!handler.includes(pattern)) throw new Error(`Coach-matching handler is missing security wiring: ${pattern}`);
}
if (handler.includes("candidateError.message") || handler.includes("String(error)")) {
  throw new Error("Coach-matching handler must not return raw backend or exception details.");
}
console.log("Edge security validation passed: adapter and coach-matching handler wiring cover P1/P2 controls.");
