import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  evaluateStaffAdminOperationalRequest,
  getStaffAdminOperationalPolicy,
  validateStaffAdminOperationalOutput,
} from "../supabase/functions/careerdev-ai-agent-runtime/staff-admin-operational-policy.mjs";

const cases = {
  ceo_operations_ai: { ownerRole: "admin", workflowKey: "executive_performance_review", inputKeys: ["quality", "outcomes", "performance_data"] },
  career_discovery_ai: { ownerRole: "staff", workflowKey: "career_profile_analysis", inputKeys: ["career_profile", "service_request"] },
  cv_linkedin_ai: { ownerRole: "staff", workflowKey: "cv_service_delivery", inputKeys: ["blueprint", "documents", "career_profile", "service_request"] },
  lead_generation_ai: { ownerRole: "staff", workflowKey: "lead_qualification", inputKeys: ["lead", "service_catalog"] },
  marketing_content_ai: { ownerRole: "staff", workflowKey: "content_creation", inputKeys: ["topic", "audience", "brand_guidance"] },
  research_opportunities_ai: { ownerRole: "staff", workflowKey: "opportunity_research", inputKeys: ["research_scope", "target_profile"] },
  sales_proposal_ai: { ownerRole: "staff", workflowKey: "proposal_generation", inputKeys: ["lead", "needs", "service"] },
};

function request(agentKey, overrides = {}) {
  const policy = cases[agentKey];
  const input = Object.fromEntries(policy.inputKeys.map((key) => [key, {}]));
  if (agentKey === "ceo_operations_ai") {
    input.quality = { delivery_score: 0.82 };
    input.outcomes = { completed: 12, target: 15 };
    input.performance_data = { reporting_period: "FY2026" };
  }
  return evaluateStaffAdminOperationalRequest({
    agent: { agent_key: agentKey, owner_role: policy.ownerRole, status: "active", active: true, human_approval_required: true },
    workflowKey: policy.workflowKey,
    workflowActive: true,
    callerRole: policy.ownerRole === "admin" ? "admin" : "staff",
    triggerSource: "staff_admin_operational",
    input,
    ...overrides,
  });
}

test("the fixed seven agent contracts have owner roles, workflows, and output schemas", () => {
  assert.deepEqual(Object.keys(cases).sort(), [
    "career_discovery_ai", "ceo_operations_ai", "cv_linkedin_ai", "lead_generation_ai",
    "marketing_content_ai", "research_opportunities_ai", "sales_proposal_ai",
  ].sort());
  for (const [agentKey, expected] of Object.entries(cases)) {
    const policy = getStaffAdminOperationalPolicy(agentKey);
    assert.equal(policy.ownerRole, expected.ownerRole);
    assert.equal(policy.workflowKey, expected.workflowKey);
    assert.ok(policy.inputKeys.length > 0);
    assert.equal(policy.outputSchema.additionalProperties, false);
    assert.equal(policy.operationallyImplemented, agentKey === "ceo_operations_ai");
  }
});

test("CEO Operations accepts only active Admin operational aggregate inputs", () => {
  assert.equal(request("ceo_operations_ai").allowed, true);
  assert.equal(request("ceo_operations_ai", { callerRole: "staff" }).code, "CALLER_ROLE_NOT_AUTHORIZED");
  assert.equal(request("ceo_operations_ai", { agent: { ...requestAgent(), owner_role: "staff" } }).code, "AGENT_OWNER_ROLE_MISMATCH");
});

test("the other six operational workflows remain blocked until their individual rollout", () => {
  for (const agentKey of Object.keys(cases).filter((key) => key !== "ceo_operations_ai")) {
    assert.equal(request(agentKey).code, "AGENT_WORKFLOW_NOT_RELEASED_IN_STAGED_ROLLOUT", agentKey);
  }
});

function requestAgent() {
  return { agent_key: "ceo_operations_ai", owner_role: "admin", status: "active", active: true, human_approval_required: true };
}

test("testing, inactive, review-disabled, wrong workflow, and test triggers are blocked", () => {
  assert.equal(request("ceo_operations_ai", { agent: { ...requestAgent(), status: "testing" } }).code, "AGENT_NOT_OPERATIONALLY_ACTIVE");
  assert.equal(request("ceo_operations_ai", { agent: { ...requestAgent(), active: false } }).code, "AGENT_NOT_OPERATIONALLY_ACTIVE");
  assert.equal(request("ceo_operations_ai", { agent: { ...requestAgent(), human_approval_required: false } }).code, "HUMAN_APPROVAL_MUST_REMAIN_REQUIRED");
  assert.equal(request("ceo_operations_ai", { workflowKey: "continuous_improvement_review" }).code, "WORKFLOW_CONTRACT_MISMATCH");
  assert.equal(request("ceo_operations_ai", { triggerSource: "test_governed" }).code, "NON_OPERATIONAL_TRIGGER_BLOCKED");
});

test("CEO Operations rejects person identifiers and schema overrides", () => {
  const personData = request("ceo_operations_ai");
  const input = { quality: { delivery_score: 0.8 }, outcomes: { completed: 2, target: 3 }, performance_data: { reporting_period: "2026-Q1", employee_id: "123" } };
  const result = evaluateStaffAdminOperationalRequest({
    agent: requestAgent(), workflowKey: "executive_performance_review", workflowActive: true,
    callerRole: "admin", triggerSource: "staff_admin_operational", input,
  });
  assert.equal(personData.allowed, true);
  assert.equal(result.code, "INDIVIDUAL_STAFF_DATA_NOT_ALLOWED");
  assert.equal(request("ceo_operations_ai", { input: { quality: {}, outcomes: {}, performance_data: {}, output_schema: {} } }).code, "CLIENT_OUTPUT_SCHEMA_NOT_ALLOWED");
});

test("CEO output contract rejects missing or empty review sections", () => {
  assert.equal(validateStaffAdminOperationalOutput("ceo_operations_ai", { risks: ["risk"], actions: ["action"], insights: ["insight"] }).valid, true);
  assert.equal(validateStaffAdminOperationalOutput("ceo_operations_ai", { risks: [], actions: [], insights: [] }).code, "CEO_REVIEW_SECTIONS_MUST_NOT_BE_EMPTY");
  assert.equal(validateStaffAdminOperationalOutput("ceo_operations_ai", { risks: [], actions: [] }).code, "OUTPUT_CONTRACT_MISMATCH");
});

test("CV and LinkedIn output cannot remove its human review requirement", () => {
  assert.equal(validateStaffAdminOperationalOutput("cv_linkedin_ai", { cv_draft: "Draft", quality_summary: "Grounded", review_required: true }).valid, true);
  assert.equal(validateStaffAdminOperationalOutput("cv_linkedin_ai", { cv_draft: "Draft", quality_summary: "Grounded", review_required: false }).code, "HUMAN_REVIEW_FLAG_REQUIRED");
});

test("runtime keeps Staff/Admin requests on the bounded Groq path and awaiting human review", async () => {
  const runtime = await readFile(new URL("../supabase/functions/careerdev-ai-agent-runtime/index.ts", import.meta.url), "utf8");
  assert.match(runtime, /evaluateStaffAdminOperationalRequest/);
  assert.match(runtime, /STAFF_ADMIN_GROQ_HARD_LIMIT_CONFIRMED/);
  assert.match(runtime, /staffAdminPolicy\?staffAdminPolicy\.outputSchema/);
  assert.match(runtime, /EXECUTION_CLAIM_FAILED/);
  assert.match(runtime, /human_review_required:requiresHumanReview,human_review_status:requiresHumanReview\?'pending':'not_required'/);
  assert.match(runtime, /finalStatus=requiresHumanReview\?'awaiting_human_review':'completed'/);
  assert.doesNotMatch(runtime, /human_review_required:false,human_review_status:'not_required'/);
  assert.doesNotMatch(runtime, /estimated_cost_usd:0,metadata:\{agent_key:agent\.agent_key/);
});

test("database migration pins the staged request path and prevents review bypass", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261124183620_staff_admin_agent_operational_authorization.sql", import.meta.url), "utf8");
  assert.match(migration, /before insert on public\.ai_agent_execution_requests/);
  assert.match(migration, /agent_row\.agent_key <> 'ceo_operations_ai'/);
  assert.match(migration, /new\.trigger_source <> 'staff_admin_operational'/);
  assert.match(migration, /new\.human_review_required is not true/);
  assert.match(migration, /new\.status = 'completed'/);
  assert.match(migration, /a\.approved_by <> request_row\.requested_by/);
  assert.match(migration, /revoke all on function public\.guard_staff_admin_agent_execution_review\(\) from public, anon/);
});
