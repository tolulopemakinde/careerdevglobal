const agentCases = {
  ceo_operations_ai: {
    name: "CEO Operations AI",
    workflow: "executive_performance_review",
    ownerRole: "admin",
    inputKeys: ["quality", "outcomes", "performance_data"],
    input: {
      quality: { source: "synthetic", delivery_score: 0.82 },
      outcomes: { source: "synthetic", completed: 12, target: 15 },
      performance_data: { source: "synthetic", reporting_period: "test-period" },
    },
    outputKeys: ["risks", "actions", "insights"],
    response: {
      risks: ["Synthetic delivery target is not yet met."],
      actions: ["Review the synthetic delivery plan."],
      insights: ["Synthetic completion is 12 of 15."],
    },
  },
  career_discovery_ai: {
    name: "Career Discovery AI",
    workflow: "career_profile_analysis",
    ownerRole: "staff",
    inputKeys: ["career_profile", "service_request"],
    input: {
      career_profile: {
        source: "synthetic",
        education: "BSc Economics",
        experience: "2 years programme coordination",
        skills: ["data analysis", "facilitation"],
      },
      service_request: { source: "synthetic", goal: "Explore evidence-based career directions." },
    },
    outputKeys: ["career_direction", "target_roles", "recommendations", "gaps"],
    response: {
      career_direction: "Programme coordination and workforce development",
      target_roles: ["Programme Officer"],
      recommendations: ["Compare role requirements with the supplied profile."],
      gaps: ["No verified seniority or outcome evidence was supplied."],
    },
  },
  cv_linkedin_ai: {
    name: "CV & LinkedIn AI",
    workflow: "cv_service_delivery",
    ownerRole: "staff",
    inputKeys: ["blueprint", "documents", "career_profile", "service_request"],
    input: {
      blueprint: { source: "synthetic", target_role: "Programme Officer" },
      documents: [{ source: "synthetic", status: "fixture-only" }],
      career_profile: { source: "synthetic", skills: ["project coordination"] },
      service_request: { source: "synthetic", deliverable: "CV draft" },
    },
    outputKeys: ["cv_draft", "quality_summary", "review_required"],
    response: {
      cv_draft: "[Synthetic CV draft; all claims require source verification.]",
      quality_summary: "Only supplied synthetic facts were used.",
      review_required: true,
    },
  },
  lead_generation_ai: {
    name: "Lead Generation AI",
    workflow: "lead_qualification",
    ownerRole: "staff",
    inputKeys: ["lead", "service_catalog"],
    input: {
      lead: { source: "synthetic", consent_status: "unknown", needs: ["career coaching"] },
      service_catalog: [{ source: "synthetic", service: "career coaching" }],
    },
    outputKeys: ["next_action", "service_fit", "qualification"],
    response: {
      next_action: "Request consent and clarify needs before any contact.",
      service_fit: "Possible fit; requirements are unverified.",
      qualification: { status: "incomplete", missing: ["consent", "budget", "timeline"] },
    },
  },
  marketing_content_ai: {
    name: "Marketing Content AI",
    workflow: "content_creation",
    ownerRole: "staff",
    inputKeys: ["topic", "audience", "brand_guidance"],
    input: {
      topic: { source: "synthetic", value: "career development" },
      audience: { source: "synthetic", value: "young professionals" },
      brand_guidance: { source: "synthetic", claims_policy: "no unsupported outcomes" },
    },
    outputKeys: ["cta", "content", "repurposing"],
    response: {
      cta: "Explore career development resources.",
      content: "[Synthetic draft; verify factual claims and brand fit before publication.]",
      repurposing: [{ channel: "LinkedIn", draft: "[Synthetic short-form draft]" }],
    },
  },
  research_opportunities_ai: {
    name: "Research & Opportunities AI",
    workflow: "opportunity_research",
    ownerRole: "staff",
    inputKeys: ["research_scope", "target_profile"],
    input: {
      research_scope: { source: "synthetic", geography: "Abuja", opportunity_type: "fellowship" },
      target_profile: { source: "synthetic", interests: ["youth development"] },
    },
    outputKeys: ["sources", "deadlines", "opportunities"],
    response: {
      sources: ["synthetic-test-fixture (not an external source)"],
      deadlines: [{ value: null, verification_status: "unverified" }],
      opportunities: [{ title: "Synthetic opportunity", verification_status: "unverified" }],
    },
  },
  sales_proposal_ai: {
    name: "Sales Proposal AI",
    workflow: "proposal_generation",
    ownerRole: "staff",
    inputKeys: ["lead", "needs", "service"],
    input: {
      lead: { source: "synthetic", consent_status: "unknown" },
      needs: { source: "synthetic", summary: "career transition support" },
      service: { source: "synthetic", name: "executive coaching", price_status: "not supplied" },
    },
    outputKeys: ["scope", "proposal", "next_steps"],
    response: {
      scope: { inclusions: ["discovery session"], exclusions: ["guaranteed outcomes"] },
      proposal: "[Synthetic outline; pricing and terms require authorized human confirmation.]",
      next_steps: ["Confirm requirements, price, and consent before sending."],
    },
  },
};

function hasValue(value, kind) {
  if (kind === "array") return Array.isArray(value);
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === "string" && value.trim().length > 0;
}

function checkOutput(caseDefinition) {
  const output = caseDefinition.response;
  const missing = caseDefinition.outputKeys.filter((key) => !(key in output));
  if (missing.length) return { passed: false, detail: `Missing required output fields: ${missing.join(", ")}` };
  for (const [key, value] of Object.entries(output)) {
    const kind = Array.isArray(value) ? "array" : value && typeof value === "object" ? "object" : typeof value;
    if (!hasValue(value, kind)) return { passed: false, detail: `Invalid mock output field: ${key}` };
  }
  return { passed: true, detail: "Agent-specific output contract passed." };
}

export const STAFF_ADMIN_AGENT_MOCK_CASES = Object.freeze(agentCases);

export function runStaffAdminAgentMockTest({ agent, actorRole, actorStatus = "active", now = () => new Date().toISOString() }) {
  const definition = agentCases[agent?.agent_key];
  const checks = [];
  const addCheck = (name, passed, detail) => checks.push({ name, status: passed ? "passed" : "blocked", detail });

  if (!definition) {
    return { status: "blocked", mode: "mocked_zero_cost", message: "This agent is outside the seven-agent Staff/Admin test scope.", checks: [{ name: "scope", status: "blocked", detail: "Use only one of the seven approved Staff/Admin agent keys." }] };
  }

  const ownerRoleMatches = agent.owner_role === definition.ownerRole;
  addCheck("owner_role_contract", ownerRoleMatches, ownerRoleMatches ? `Registry owner role matches ${definition.ownerRole}.` : `Expected registry owner role ${definition.ownerRole}.`);
  const roleAllowed = ownerRoleMatches && actorStatus === "active" && (actorRole === "admin" || (actorRole === "staff" && definition.ownerRole === "staff"));
  addCheck("role_authorization", roleAllowed, roleAllowed ? `${actorRole} access is allowed for this test case.` : "Active Admin access is required for the Admin-owned agent; Staff-owned agents require active Staff or Admin access.");

  const identityMatches = agent.agent_key === Object.keys(agentCases).find((key) => agentCases[key] === definition);
  addCheck("agent_identity", identityMatches, identityMatches ? "Agent key is in the fixed seven-agent allowlist." : "Agent identity did not match the fixed allowlist.");

  const workflowMatches = agent.workflow_key === definition.workflow;
  addCheck("workflow_contract", workflowMatches, workflowMatches ? `Workflow ${definition.workflow} matches the reviewed contract.` : `Expected workflow ${definition.workflow}.`);

  const testingOnly = agent.status === "testing" && agent.active === false;
  addCheck("testing_only", testingOnly, testingOnly ? "Registry status is testing and operational active flag is off." : "Blocked until registry status is testing and operational active flag is off.");

  const approvalRequired = agent.human_approval_required === true;
  addCheck("human_review_gate", approvalRequired, approvalRequired ? "Human review is required; this mock cannot approve or complete operational work." : "Registry must require human review before this test can pass.");

  const missingInput = definition.inputKeys.filter((key) => !(key in definition.input));
  addCheck("synthetic_input_contract", missingInput.length === 0, missingInput.length ? `Missing synthetic input fields: ${missingInput.join(", ")}` : "All required workflow inputs are present and explicitly synthetic.");

  const resultCheck = checkOutput(definition);
  addCheck("mock_result_contract", resultCheck.passed, resultCheck.detail);

  const passed = checks.every((check) => check.status === "passed");
  const preparationPassed = workflowMatches && testingOnly && approvalRequired && missingInput.length === 0;
  const mockExecutionRan = roleAllowed && preparationPassed;
  const stages = [
    { name: "authorization", status: roleAllowed ? "passed" : "blocked" },
    { name: "preparation", status: roleAllowed ? (preparationPassed ? "simulated" : "blocked") : "not_run" },
    { name: "mock_execution", status: mockExecutionRan ? "simulated" : "not_run" },
    { name: "result_validation", status: mockExecutionRan ? (resultCheck.passed ? "passed" : "blocked") : "not_run" },
    { name: "human_review", status: "pending" },
  ];
  return {
    status: passed ? "passed" : "blocked",
    mode: "mocked_zero_cost",
    test_run_at: now(),
    agent: definition.name,
    agent_key: agent.agent_key,
    workflow_key: definition.workflow,
    checks,
    stages,
    ...(mockExecutionRan ? { synthetic_input: definition.input, mock_result: definition.response } : {}),
    execution: { authorization: roleAllowed ? "passed" : "blocked", preparation: preparationPassed && roleAllowed ? "simulated" : "not_run", provider: "mock_fixture", provider_calls: 0, network_calls: 0, model_tokens: 0, estimated_cost_usd: 0, persisted: false },
    human_review: { required: true, status: "pending", human_approved: false },
    activation: { status: agent.status, active: agent.active, operational_use: "blocked" },
    message: passed ? "Mocked test passed. This confirms local workflow contracts only; it does not call or certify the deployed runtime." : "Mocked test was blocked by one or more safety or contract checks. Review the failed checks before any activation review.",
  };
}
