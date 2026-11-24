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
  if (agentKey === "cv_linkedin_ai") {
    input.blueprint = { source: "synthetic", target_role: "Programme Officer" };
    input.documents = [{ source: "synthetic", document_type: "career_evidence", content: "Synthetic evidence for testing only." }];
    input.career_profile = { source: "synthetic", summary: "Synthetic programme professional.", experience: ["Supported a synthetic youth programme."], skills: ["facilitation"] };
    input.service_request = { source: "synthetic", deliverables: ["cv", "linkedin"], target_role: "Programme Officer" };
  }
  if (agentKey === "lead_generation_ai") {
    input.lead = { source: "synthetic", role_title: "Operations Director", organization_type: "Nonprofit", needs: ["career transition workshops"], consent_status: "unknown" };
    input.service_catalog = [{ source: "synthetic", service_name: "Career development workshop", description: "Group career planning support." }];
  }
  return evaluateStaffAdminOperationalRequest({
    agent: { agent_key: agentKey, owner_role: policy.ownerRole, status: "live", active: true, human_approval_required: true },
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
    assert.equal(policy.operationallyImplemented, ["ceo_operations_ai", "career_discovery_ai", "cv_linkedin_ai", "lead_generation_ai", "marketing_content_ai"].includes(agentKey));
  }
});

test("CEO Operations accepts only active Admin operational aggregate inputs", () => {
  assert.equal(request("ceo_operations_ai").allowed, true);
  assert.equal(request("ceo_operations_ai", { callerRole: "staff" }).code, "CALLER_ROLE_NOT_AUTHORIZED");
  assert.equal(request("ceo_operations_ai", { agent: { ...requestAgent(), owner_role: "staff" } }).code, "AGENT_OWNER_ROLE_MISMATCH");
});

test("the remaining two operational workflows remain blocked until their individual rollout", () => {
  for (const agentKey of Object.keys(cases).filter((key) => !["ceo_operations_ai", "career_discovery_ai", "cv_linkedin_ai", "lead_generation_ai", "marketing_content_ai"].includes(key))) {
    assert.equal(request(agentKey).code, "AGENT_WORKFLOW_NOT_RELEASED_IN_STAGED_ROLLOUT", agentKey);
  }
});

test("Career Discovery accepts only bounded synthetic profile and request fields", () => {
  const input = {
    career_profile: { source: "synthetic", education: "BA Sociology", experience: "2 years programme support", skills: ["facilitation", "reporting"] },
    service_request: { source: "synthetic", goal: "Explore programme coordination", target_roles: ["Programme Officer"] },
  };
  assert.equal(request("career_discovery_ai", { input }).allowed, true);
  assert.equal(request("career_discovery_ai", { input: { ...input, career_profile: { ...input.career_profile, email: "person@example.com" } } }).code, "CAREER_DISCOVERY_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("career_discovery_ai", { input: { ...input, career_profile: { ...input.career_profile, experience: "Contact test@example.com" } } }).code, "CAREER_DISCOVERY_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("career_discovery_ai", { input: { ...input, career_profile: { ...input.career_profile, source: "account" } } }).code, "CAREER_DISCOVERY_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("career_discovery_ai", { callerRole: "client", input }).code, "CALLER_ROLE_NOT_AUTHORIZED");
});

test("Career Discovery output requires meaningful recommendations and evidence gaps", () => {
  assert.equal(validateStaffAdminOperationalOutput("career_discovery_ai", { career_direction: "Explore programme roles", target_roles: [], recommendations: ["Compare supplied skills with role requirements."], gaps: ["Role evidence is unverified."] }).valid, true);
  assert.equal(validateStaffAdminOperationalOutput("career_discovery_ai", { career_direction: "Explore programme roles", target_roles: [], recommendations: [], gaps: ["Role evidence is unverified."] }).code, "CAREER_DISCOVERY_REVIEW_SECTIONS_MUST_NOT_BE_EMPTY");
});

test("CV & LinkedIn accepts only synthetic source evidence and matching requested deliverables", () => {
  const policy = cases.cv_linkedin_ai;
  const input = {
    blueprint: { source: "synthetic", target_role: "Programme Officer" },
    documents: [{ source: "synthetic", document_type: "career_evidence", content: "Synthetic evidence for testing only." }],
    career_profile: { source: "synthetic", summary: "Synthetic programme professional.", experience: ["Supported a synthetic youth programme."], skills: ["facilitation"] },
    service_request: { source: "synthetic", deliverables: ["cv", "linkedin"], target_role: "Programme Officer" },
  };
  assert.equal(request("cv_linkedin_ai", { input }).allowed, true);
  assert.equal(request("cv_linkedin_ai", { input: { ...input, career_profile: { ...input.career_profile, email: "test@example.com" } } }).code, "CV_LINKEDIN_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("cv_linkedin_ai", { input: { ...input, service_request: { ...input.service_request, deliverables: ["cv"] } } }).code, "CV_LINKEDIN_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("cv_linkedin_ai", { input: { ...input, blueprint: { ...input.blueprint, target_role: "Different role" } } }).code, "CV_LINKEDIN_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("cv_linkedin_ai", { callerRole: "client", input }).code, "CALLER_ROLE_NOT_AUTHORIZED");
  assert.equal(policy.inputKeys.length, 4);
});

test("Lead Generation accepts synthetic organization-level need data without personal identifiers", () => {
  const input = {
    lead: { source: "synthetic", role_title: "Operations Director", organization_type: "Nonprofit", needs: ["career transition workshops"], consent_status: "unknown" },
    service_catalog: [{ source: "synthetic", service_name: "Career development workshop", description: "Group career planning support." }],
  };
  assert.equal(request("lead_generation_ai", { input }).allowed, true);
  assert.equal(request("lead_generation_ai", { input: { ...input, lead: { ...input.lead, full_name: "Test Person" } } }).code, "LEAD_GENERATION_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("lead_generation_ai", { input: { ...input, lead: { ...input.lead, needs: ["Contact test@example.com"] } } }).code, "LEAD_GENERATION_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("lead_generation_ai", { input: { ...input, lead: { ...input.lead, source: "linkedin_profile" } } }).code, "LEAD_GENERATION_SYNTHETIC_INPUT_INVALID");
});

test("Lead Generation cannot recommend outreach without consent or on do-not-contact", () => {
  const output = { next_action: "Confirm consent and permission before any contact.", service_fit: "Possible fit based on supplied synthetic needs; unverified.", qualification: { status: "incomplete", missing: ["consent confirmation"], evidence: ["Synthetic needs align with a listed service."] } };
  assert.equal(validateStaffAdminOperationalOutput("lead_generation_ai", output, { lead: { consent_status: "unknown" } }).valid, true);
  assert.equal(validateStaffAdminOperationalOutput("lead_generation_ai", { ...output, next_action: "Send an introduction." }, { lead: { consent_status: "unknown" } }).code, "LEAD_OUTREACH_PERMISSION_REVIEW_MISSING");
  assert.equal(validateStaffAdminOperationalOutput("lead_generation_ai", { ...output, next_action: "No outreach. Do not contact this lead." }, { lead: { consent_status: "do_not_contact" } }).valid, true);
  assert.equal(validateStaffAdminOperationalOutput("lead_generation_ai", { ...output, next_action: "Confirm consent before contact." }, { lead: { consent_status: "do_not_contact" } }).code, "LEAD_DO_NOT_CONTACT_BOUNDARY_MISSING");
});

test("Marketing Content accepts bounded synthetic fields and validates structured draft output", () => {
  const input = { topic: "Synthetic career planning", audience: "Synthetic early-career audience", brand_guidance: "Practical tone; CTA should invite resource exploration." };
  assert.equal(request("marketing_content_ai", { input }).allowed, true);
  assert.equal(request("marketing_content_ai", { input: { ...input, topic: "Contact test@example.com" } }).code, "MARKETING_CONTENT_SYNTHETIC_INPUT_INVALID");
  assert.equal(request("marketing_content_ai", { input: { ...input, unknown: "override" } }).code, "MARKETING_CONTENT_SYNTHETIC_INPUT_INVALID");
  const output = { cta: "Explore available resources.", content: "A draft based only on the synthetic topic.", repurposing: [{ channel: "LinkedIn", draft: "A short synthetic draft." }] };
  assert.equal(validateStaffAdminOperationalOutput("marketing_content_ai", output, input).valid, true);
  assert.equal(validateStaffAdminOperationalOutput("marketing_content_ai", { ...output, repurposing: [{ channel: "LinkedIn", draft: "" }] }, input).code, "MARKETING_CONTENT_OUTPUT_INVALID");
});

function requestAgent() {
  return { agent_key: "ceo_operations_ai", owner_role: "admin", status: "live", active: true, human_approval_required: true };
}

test("testing, inactive, review-disabled, wrong workflow, and test triggers are blocked", () => {
  assert.equal(request("ceo_operations_ai", { agent: { ...requestAgent(), status: "testing" } }).code, "AGENT_NOT_OPERATIONALLY_ACTIVE");
  assert.equal(request("ceo_operations_ai", { agent: { ...requestAgent(), status: "active" } }).code, "AGENT_NOT_OPERATIONALLY_ACTIVE");
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
  const output = { cv_draft: "CV DRAFT\nSynthetic draft\nLINKEDIN DRAFT\nSynthetic profile draft", quality_summary: "Grounded", review_required: true };
  assert.equal(validateStaffAdminOperationalOutput("cv_linkedin_ai", output).valid, true);
  assert.equal(validateStaffAdminOperationalOutput("cv_linkedin_ai", { ...output, review_required: false }).code, "HUMAN_REVIEW_FLAG_REQUIRED");
  assert.equal(validateStaffAdminOperationalOutput("cv_linkedin_ai", { ...output, cv_draft: "Draft" }).code, "CV_LINKEDIN_SECTIONS_MISSING");
});

test("runtime keeps Staff/Admin requests on the bounded Groq path and awaiting human review", async () => {
  const runtime = await readFile(new URL("../supabase/functions/careerdev-ai-agent-runtime/index.ts", import.meta.url), "utf8");
  assert.match(runtime, /evaluateStaffAdminOperationalRequest/);
  assert.match(runtime, /STAFF_ADMIN_GROQ_HARD_LIMIT_CONFIRMED/);
  assert.match(runtime, /if\(!staffAdminPolicy&&dependencyMode!=='works_without_ai'\)/);
  assert.match(runtime, /never initiate outreach/);
  assert.match(runtime, /staffAdminPolicy\?staffAdminPolicy\.outputSchema/);
  assert.match(runtime, /EXECUTION_CLAIM_FAILED/);
  assert.match(runtime, /human_review_required:requiresHumanReview,human_review_status:requiresHumanReview\?'pending':'not_required'/);
  assert.match(runtime, /finalStatus=requiresHumanReview\?'awaiting_human_review':'completed'/);
  assert.doesNotMatch(runtime, /human_review_required:false,human_review_status:'not_required'/);
  assert.doesNotMatch(runtime, /estimated_cost_usd:0,metadata:\{agent_key:agent\.agent_key/);
});

test("database migration pins the staged request path and prevents review bypass", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261124191002_staff_admin_agent_guards_postgres_compatibility.sql", import.meta.url), "utf8");
  assert.match(migration, /before insert on public\.ai_agent_execution_requests/);
  assert.match(migration, /agent_row\.agent_key <> 'ceo_operations_ai'/);
  assert.match(migration, /new\.trigger_source <> 'staff_admin_operational'/);
  assert.match(migration, /new\.human_review_required is not true/);
  assert.match(migration, /new\.status = 'completed'/);
  assert.match(migration, /a\.approved_by <> request_row\.requested_by/);
  assert.match(migration, /revoke all on function public\.guard_staff_admin_agent_execution_review\(\) from public, anon/);
  const careerMigration = await readFile(new URL("../supabase/migrations/20261124200000_staff_admin_career_discovery_guard.sql", import.meta.url), "utf8");
  assert.match(careerMigration, /agent_row\.agent_key not in \('ceo_operations_ai', 'career_discovery_ai'\)/);
  assert.match(careerMigration, /career_discovery_ai' then 'career_profile_analysis'/);
  assert.match(careerMigration, /Career Discovery accepts only bounded synthetic inputs without contact details/);
  assert.match(careerMigration, /linkedin\[\.\]com/);
  assert.match(careerMigration, /new\.human_review_required is not true/);
  const cvMigration = await readFile(new URL("../supabase/migrations/20261124210000_staff_admin_cv_linkedin_guard.sql", import.meta.url), "utf8");
  assert.match(cvMigration, /agent_row\.agent_key not in \('ceo_operations_ai', 'career_discovery_ai', 'cv_linkedin_ai'\)/);
  assert.match(cvMigration, /CV & LinkedIn accepts only bounded synthetic career evidence/);
  assert.match(cvMigration, /new\.human_review_required is not true/);
  const leadMigration = await readFile(new URL("../supabase/migrations/20261124220000_staff_admin_lead_generation_guard.sql", import.meta.url), "utf8");
  assert.match(leadMigration, /agent_row\.agent_key not in \('ceo_operations_ai', 'career_discovery_ai', 'cv_linkedin_ai', 'lead_generation_ai'\)/);
  assert.match(leadMigration, /Lead Generation accepts only bounded synthetic organization-level need data/);
  assert.match(leadMigration, /new\.human_review_required is not true/);
  const marketingMigration = await readFile(new URL("../supabase/migrations/20261124230000_staff_admin_marketing_content_guard.sql", import.meta.url), "utf8");
  assert.match(marketingMigration, /agent_row\.agent_key not in \('ceo_operations_ai', 'career_discovery_ai', 'cv_linkedin_ai', 'lead_generation_ai', 'marketing_content_ai'\)/);
  assert.match(marketingMigration, /Marketing Content accepts only bounded synthetic topic, audience, and brand guidance/);
  assert.match(marketingMigration, /new\.human_review_required is not true/);
});
