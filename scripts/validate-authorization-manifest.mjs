import { readFileSync } from "node:fs";

const path = "docs/phase-1/authorization-test-manifest.json";
const manifest = JSON.parse(readFileSync(path, "utf8"));
const requiredCases = [
  "auth-anonymous-admin-rpc",
  "auth-client-cross-user-execution",
  "ai-review-required-completion",
  "workspace-reset-cross-user",
  "ai-credit-idempotency",
  "payout-transfer-idempotency",
  "matching-private-field-redaction",
];

if (manifest.environment_policy?.requires_isolated_preview !== true) {
  throw new Error("Authorization tests must require an isolated preview project.");
}
if (manifest.environment_policy?.allow_production !== false) {
  throw new Error("Authorization tests must explicitly block production execution.");
}
if (manifest.environment_policy?.uses_synthetic_identities_only !== true) {
  throw new Error("Authorization tests must use synthetic identities only.");
}

const cases = manifest.test_cases;
if (!Array.isArray(cases) || cases.length < requiredCases.length) {
  throw new Error("Authorization manifest does not contain enough test cases.");
}
const ids = new Set();
for (const testCase of cases) {
  for (const field of ["id", "category", "action", "actor", "expected", "risk"]) {
    if (typeof testCase[field] !== "string" || testCase[field].length === 0) {
      throw new Error(`Test case is missing ${field}: ${JSON.stringify(testCase)}`);
    }
  }
  if (ids.has(testCase.id)) throw new Error(`Duplicate test case id: ${testCase.id}`);
  ids.add(testCase.id);
}
for (const id of requiredCases) {
  if (!ids.has(id)) throw new Error(`Required test case is missing: ${id}`);
}

console.log(`Authorization manifest passed: ${cases.length} production-blocked synthetic test cases.`);
