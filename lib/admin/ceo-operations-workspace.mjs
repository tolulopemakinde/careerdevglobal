export function createExecutiveReview(input = {}, generatedAt = new Date().toISOString()) {
  const period = String(input.period || "").trim();
  const target = Number(input.target);
  const completed = Number(input.completed);
  const qualityScore = Number(input.qualityScore);
  if (!period) throw new Error("A reporting period is required.");
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(completed) || completed < 0 || completed > target) {
    throw new Error("Completed outcomes and target must be valid aggregate counts, with completed between zero and the target.");
  }
  if (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100) {
    throw new Error("Quality score must be a synthetic aggregate value from 0 to 100.");
  }
  const completionRate = Math.round((completed / target) * 100);
  const risks = [];
  const actions = [];
  if (completed < target) {
    risks.push("Aggregate delivery is below the entered target; confirm the underlying evidence and context.");
    actions.push("Review delivery barriers and agree corrective actions with the accountable team.");
  }
  if (qualityScore < 70) {
    risks.push("The entered aggregate quality score is below the review threshold.");
    actions.push("Validate the quality measure and identify support or process changes.");
  }
  if (!risks.length) risks.push("No threshold flag was raised by the supplied synthetic aggregate values.");
  if (!actions.length) actions.push("Have a human reviewer confirm source data and maintain the current review cadence.");
  return {
    generatedAt,
    period,
    target,
    completed,
    completionRate,
    qualityScore,
    risks,
    actions,
    evidenceBoundary: "This summary uses only values entered by an Admin. It does not verify source records and does not assess individual staff performance.",
    humanReviewRequired: true,
    status: "testing_preview",
  };
}

export function executiveReviewToMarkdown(review) {
  return [
    `# Executive operations review — ${review.period}`,
    `\nGenerated: ${review.generatedAt}`,
    `\n## Aggregate indicators\n- Outcomes: ${review.completed} / ${review.target}\n- Completion: ${review.completionRate}%\n- Quality score: ${review.qualityScore}%`,
    `\n## Risks to review\n${review.risks.map((item) => `- ${item}`).join("\n")}`,
    `\n## Suggested actions\n${review.actions.map((item) => `- ${item}`).join("\n")}`,
    `\n## Evidence and review\n${review.evidenceBoundary}\nHuman review required: yes. Testing preview only.`,
  ].join("\n");
}

export async function runCEOOperationsDraft(supabase, payload) {
  const requested = await supabase.rpc("request_ai_agent_execution", {
    p_agent_key: "ceo_operations_ai",
    p_workflow_key: "executive_performance_review",
    p_trigger_source: "staff_admin_operational",
    p_input_payload: payload,
  });
  if (requested.error || !requested.data) throw new Error("The CEO Operations request could not be authorized. No provider call was made.");
  const requestId = String(requested.data);

  const prepared = await supabase.rpc("prepare_ai_agent_execution", { p_request_id: requestId });
  if (prepared.error || !prepared.data?.execution_id) throw new Error(`The CEO Operations request could not be prepared. No provider call was made. Check AI Governance for request ${requestId}.`);
  const executionId = String(prepared.data.execution_id);

  const run = await supabase.functions.invoke("careerdev-ai-agent-runtime", { body: { request_id: requestId } });
  if (run.error || !run.data) {
    let failure;
    try { failure = await run.error?.context?.json?.(); } catch {}
    const detail = {
      STAFF_ADMIN_PROVIDER_NOT_READY: "Groq setup is incomplete. Ask the runtime administrator to verify the approved model, rates, and spend limit.",
      CEO_PROVIDER_TRANSPORT_ERROR: "Groq did not return a readable response.",
      CEO_PROVIDER_RESPONSE_INVALID: "Groq returned an invalid response.",
      EXECUTION_CLAIM_FAILED: "The execution could not be started. No provider call was made by this attempt.",
      EXECUTION_REVIEW_STATE_ERROR: "The draft was saved, but the workflow could not enter independent review.",
      OUTPUT_CONTRACT_MISMATCH: "The provider draft failed the review format check.",
    }[failure?.code] || "The governed runtime could not return a CEO Operations draft.";
    throw new Error(`${detail} Check AI Governance for execution ${executionId}.`);
  }
  if (run.data.status !== "awaiting_human_review" || run.data.human_review_required !== true) {
    throw new Error("The runtime did not preserve the required human-review state. Do not use this result.");
  }
  const output = run.data.output;
  const sections = [output?.risks, output?.actions, output?.insights];
  if (run.data.execution_id !== executionId || sections.some((items) => !Array.isArray(items) || !items.length || items.some((item) => typeof item !== "string" || !item.trim()))) {
    throw new Error(`The runtime did not return a valid draft for execution ${executionId}. Check AI Governance.`);
  }
  return { ...run.data, requestId, executionId };
}

export async function requestCEOIndependentReview(supabase, result) {
  if (!result?.requestId || !result?.executionId) throw new Error("A persisted CEO Operations execution is required before requesting independent review.");
  const { data, error } = await supabase.rpc("request_ai_human_approval", { p_request_id: result.requestId, p_execution_id: result.executionId });
  if (error) throw new Error("Independent review request could not be created. Open AI Governance and inspect the execution.");
  return data;
}
