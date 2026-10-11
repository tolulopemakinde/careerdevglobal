import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sqlPath = path.join(root, "docs/phase-3/preview-distributed-quotas.sql");
const planPath = path.join(root, "docs/phase-3/preview-deployment-plan.md");
const adapterPath = path.join(root, "supabase/functions/_shared/edge-security.ts");
const handlerPath = path.join(root, "supabase/functions/careerdev-coach-matching/index.ts");

for (const file of [sqlPath, planPath, adapterPath, handlerPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing Phase 3 artifact: ${file}`);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const plan = fs.readFileSync(planPath, "utf8");
const adapter = fs.readFileSync(adapterPath, "utf8");
const handler = fs.readFileSync(handlerPath, "utf8");
const serviceRoleMarker = ["SUPABASE", "SERVICE_ROLE", "KEY"].join("_");

if (!sql.includes("PHASE 3 PREVIEW ARTIFACT") || !sql.includes("NOT APPLIED")) throw new Error("SQL must be explicitly marked preview-only");
if (!plan.includes("production-blocked") || !plan.includes("Separate Supabase project ref")) throw new Error("Preview plan must require an isolated project");
for (const required of ["ai_distributed_rate_limits", "ai_shared_quota_policies", "ai_shared_quota_usage", "consume_distributed_rate_limit", "consume_shared_ai_quota"]) {
  if (!sql.includes(required)) throw new Error(`Missing shared-control contract: ${required}`);
}
if (!sql.includes("revoke all on function")) throw new Error("Service-only RPCs must revoke public roles");
for (const required of ["consumeDistributedRateLimit", "consumeSharedQuota", "DISTRIBUTED_RATE_LIMIT_ENABLED"]) {
  if (!adapter.includes(required) && !handler.includes(required)) throw new Error(`Missing handler integration marker: ${required}`);
}
if (!handler.includes(serviceRoleMarker)) throw new Error("Handler must use a server-only service-role client when distributed mode is enabled");
if (!handler.includes("shared_quota_exhausted") && !handler.includes("consumeSharedQuota")) throw new Error("Coach handler must enforce the shared quota result");
if (handler.includes('"Access-Control-Allow-Origin":"*"')) throw new Error("Wildcard CORS is forbidden in the hardened handler");
console.log("Phase 3 preview controls validated; no production connection or mutation was performed.");
