const stringArray = { type: "array", items: { type: "string" } };
const text = { type: "string" };
const qualification = {
  type: "object",
  properties: { status: text, missing: stringArray, evidence: stringArray },
  required: ["status", "missing", "evidence"],
  additionalProperties: false,
};
const repurposedDraft = {
  type: "object",
  properties: { channel: text, draft: text },
  required: ["channel", "draft"],
  additionalProperties: false,
};
const deadline = {
  type: "object",
  properties: { deadline: text, verification_status: text, source: text },
  required: ["deadline", "verification_status", "source"],
  additionalProperties: false,
};
const opportunity = {
  type: "object",
  properties: { title: text, summary: text, source_url: text, deadline: text, verification_status: text },
  required: ["title", "summary", "source_url", "deadline", "verification_status"],
  additionalProperties: false,
};
const proposalScope = {
  type: "object",
  properties: { inclusions: stringArray, exclusions: stringArray, assumptions: stringArray },
  required: ["inclusions", "exclusions", "assumptions"],
  additionalProperties: false,
};

const policies = {
  ceo_operations_ai: {
    operationallyImplemented: true,
    ownerRole: "admin",
    workflowKey: "executive_performance_review",
    inputKeys: ["quality", "outcomes", "performance_data"],
    outputSchema: {
      type: "object",
      properties: { risks: stringArray, actions: stringArray, insights: stringArray },
      required: ["risks", "actions", "insights"],
      additionalProperties: false,
    },
    outputTypes: { risks: "string_array", actions: "string_array", insights: "string_array" },
  },
  career_discovery_ai: {
    operationallyImplemented: false,
    ownerRole: "staff",
    workflowKey: "career_profile_analysis",
    inputKeys: ["career_profile", "service_request"],
    outputSchema: {
      type: "object",
      properties: { career_direction: text, target_roles: stringArray, recommendations: stringArray, gaps: stringArray },
      required: ["career_direction", "target_roles", "recommendations", "gaps"],
      additionalProperties: false,
    },
    outputTypes: { career_direction: "string", target_roles: "string_array", recommendations: "string_array", gaps: "string_array" },
  },
  cv_linkedin_ai: {
    operationallyImplemented: false,
    ownerRole: "staff",
    workflowKey: "cv_service_delivery",
    inputKeys: ["blueprint", "documents", "career_profile", "service_request"],
    outputSchema: {
      type: "object",
      properties: { cv_draft: text, quality_summary: text, review_required: { type: "boolean" } },
      required: ["cv_draft", "quality_summary", "review_required"],
      additionalProperties: false,
    },
    outputTypes: { cv_draft: "string", quality_summary: "string", review_required: "boolean" },
  },
  lead_generation_ai: {
    operationallyImplemented: false,
    ownerRole: "staff",
    workflowKey: "lead_qualification",
    inputKeys: ["lead", "service_catalog"],
    outputSchema: {
      type: "object",
      properties: { next_action: text, service_fit: text, qualification },
      required: ["next_action", "service_fit", "qualification"],
      additionalProperties: false,
    },
    outputTypes: { next_action: "string", service_fit: "string", qualification: "object" },
  },
  marketing_content_ai: {
    operationallyImplemented: false,
    ownerRole: "staff",
    workflowKey: "content_creation",
    inputKeys: ["topic", "audience", "brand_guidance"],
    outputSchema: {
      type: "object",
      properties: { cta: text, content: text, repurposing: { type: "array", items: repurposedDraft } },
      required: ["cta", "content", "repurposing"],
      additionalProperties: false,
    },
    outputTypes: { cta: "string", content: "string", repurposing: "object_array" },
  },
  research_opportunities_ai: {
    operationallyImplemented: false,
    ownerRole: "staff",
    workflowKey: "opportunity_research",
    inputKeys: ["research_scope", "target_profile"],
    outputSchema: {
      type: "object",
      properties: { sources: stringArray, deadlines: { type: "array", items: deadline }, opportunities: { type: "array", items: opportunity } },
      required: ["sources", "deadlines", "opportunities"],
      additionalProperties: false,
    },
    outputTypes: { sources: "string_array", deadlines: "object_array", opportunities: "object_array" },
  },
  sales_proposal_ai: {
    operationallyImplemented: false,
    ownerRole: "staff",
    workflowKey: "proposal_generation",
    inputKeys: ["lead", "needs", "service"],
    outputSchema: {
      type: "object",
      properties: { scope: proposalScope, proposal: text, next_steps: stringArray },
      required: ["scope", "proposal", "next_steps"],
      additionalProperties: false,
    },
    outputTypes: { scope: "object", proposal: "string", next_steps: "string_array" },
  },
};

const sensitiveCEOKey = /(?:^|_)(?:name|email|phone|staff_id|employee_id|person_id|user_id|linkedin_url|address)(?:$|_)/i;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasExactKeys = (value, expected) => isObject(value) && Object.keys(value).length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));

export function getStaffAdminOperationalPolicy(agentKey) {
  return policies[agentKey] || null;
}

function containsIdentifiableCEOField(value) {
  if (Array.isArray(value)) return value.some(containsIdentifiableCEOField);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, item]) => sensitiveCEOKey.test(key) || containsIdentifiableCEOField(item));
}

export function evaluateStaffAdminOperationalRequest({ agent, workflowKey, workflowActive, callerRole, triggerSource, input }) {
  const policy = getStaffAdminOperationalPolicy(agent?.agent_key);
  if (!policy) return { allowed: false, code: "AGENT_OUTSIDE_STAFF_ADMIN_ALLOWLIST" };
  if (policy.operationallyImplemented !== true) return { allowed: false, code: "AGENT_WORKFLOW_NOT_RELEASED_IN_STAGED_ROLLOUT" };
  if (agent.owner_role !== policy.ownerRole) return { allowed: false, code: "AGENT_OWNER_ROLE_MISMATCH" };
  if (policy.ownerRole === "admin" ? callerRole !== "admin" : !["admin", "staff"].includes(callerRole)) {
    return { allowed: false, code: "CALLER_ROLE_NOT_AUTHORIZED" };
  }
  if (agent.status !== "active" || agent.active !== true) return { allowed: false, code: "AGENT_NOT_OPERATIONALLY_ACTIVE" };
  if (agent.human_approval_required !== true) return { allowed: false, code: "HUMAN_APPROVAL_MUST_REMAIN_REQUIRED" };
  if (workflowKey !== policy.workflowKey || workflowActive !== true) return { allowed: false, code: "WORKFLOW_CONTRACT_MISMATCH" };
  if (triggerSource !== "staff_admin_operational") return { allowed: false, code: "NON_OPERATIONAL_TRIGGER_BLOCKED" };
  if (!isObject(input) || JSON.stringify(input).length > 12000) return { allowed: false, code: "INPUT_PAYLOAD_INVALID_OR_TOO_LARGE" };
  if (policy.inputKeys.some((key) => !(key in input))) return { allowed: false, code: "REQUIRED_INPUT_MISSING" };
  if (Object.prototype.hasOwnProperty.call(input, "output_schema")) return { allowed: false, code: "CLIENT_OUTPUT_SCHEMA_NOT_ALLOWED" };
  if (Object.prototype.hasOwnProperty.call(input, "service_execution_id")) return { allowed: false, code: "SERVICE_EXECUTION_NOT_ALLOWED_FOR_STAFF_ADMIN_AGENT" };
  if (agent.agent_key === "ceo_operations_ai") {
    if (containsIdentifiableCEOField(input)) return { allowed: false, code: "INDIVIDUAL_STAFF_DATA_NOT_ALLOWED" };
    const quality = input.quality;
    const outcomes = input.outcomes;
    const period = input.performance_data?.reporting_period;
    const score = quality?.delivery_score;
    if (!hasExactKeys(input, policy.inputKeys) || !hasExactKeys(quality, ["delivery_score"]) || !Number.isFinite(score) || score < 0 || score > 1) return { allowed: false, code: "AGGREGATE_QUALITY_INPUT_INVALID" };
    if (!hasExactKeys(outcomes, ["completed", "target"]) || !Number.isInteger(outcomes.completed) || !Number.isInteger(outcomes.target) || outcomes.completed < 0 || outcomes.target < 1 || outcomes.completed > outcomes.target) return { allowed: false, code: "AGGREGATE_OUTCOME_INPUT_INVALID" };
    if (!hasExactKeys(input.performance_data, ["reporting_period"]) || typeof period !== "string" || !/^(?:FY)?20\d{2}(?:[-/ ]?(?:Q[1-4]|H[1-2]|M(?:0[1-9]|1[0-2])))?$/i.test(period.trim())) return { allowed: false, code: "REPORTING_PERIOD_INVALID" };
  }
  return { allowed: true, policy };
}

export function validateStaffAdminOperationalOutput(agentKey, output) {
  const policy = getStaffAdminOperationalPolicy(agentKey);
  if (!policy || !isObject(output)) return { valid: false, code: "OUTPUT_NOT_AN_OBJECT" };
  const expected = Object.keys(policy.outputTypes);
  if (expected.some((key) => !(key in output)) || Object.keys(output).some((key) => !expected.includes(key))) {
    return { valid: false, code: "OUTPUT_CONTRACT_MISMATCH" };
  }
  for (const [key, type] of Object.entries(policy.outputTypes)) {
    const value = output[key];
    if (type === "string" && (typeof value !== "string" || !value.trim() || value.length > 4000)) return { valid: false, code: `OUTPUT_FIELD_INVALID:${key}` };
    if (type === "boolean" && typeof value !== "boolean") return { valid: false, code: `OUTPUT_FIELD_INVALID:${key}` };
    if (type === "object" && !isObject(value)) return { valid: false, code: `OUTPUT_FIELD_INVALID:${key}` };
    if (type === "string_array" && (!Array.isArray(value) || value.length > 12 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 1000))) return { valid: false, code: `OUTPUT_FIELD_INVALID:${key}` };
    if (type === "object_array" && (!Array.isArray(value) || value.length > 25 || value.some((item) => !isObject(item)))) return { valid: false, code: `OUTPUT_FIELD_INVALID:${key}` };
  }
  if (agentKey === "cv_linkedin_ai" && output.review_required !== true) return { valid: false, code: "HUMAN_REVIEW_FLAG_REQUIRED" };
  if (agentKey === "ceo_operations_ai" && Object.values(output).some((items) => !items.length)) return { valid: false, code: "CEO_REVIEW_SECTIONS_MUST_NOT_BE_EMPTY" };
  return { valid: true };
}
