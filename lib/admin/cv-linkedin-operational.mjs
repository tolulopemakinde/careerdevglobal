const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOutput(output) {
  if (!isRecord(output) || Object.keys(output).sort().join(',') !== 'cv_draft,quality_summary,review_required') {
    throw new Error('The CV & LinkedIn result did not match its approved output contract. Do not use it.');
  }
  if (typeof output.cv_draft !== 'string' || !output.cv_draft.trim() || output.cv_draft.length > 4000
    || !/CV DRAFT/i.test(output.cv_draft) || !/LINKEDIN DRAFT/i.test(output.cv_draft)
    || typeof output.quality_summary !== 'string' || !output.quality_summary.trim() || output.quality_summary.length > 4000
    || output.review_required !== true) {
    throw new Error('The CV & LinkedIn result is incomplete or missing its human-review flag. Do not use it.');
  }
  return output;
}

export async function runCvLinkedInDraft(supabase, payload) {
  const requested = await supabase.rpc('request_ai_agent_execution', {
    p_agent_key: 'cv_linkedin_ai', p_workflow_key: 'cv_service_delivery',
    p_trigger_source: 'staff_admin_operational', p_input_payload: payload,
  });
  if (requested.error || !requested.data) throw new Error('The CV & LinkedIn request was not authorized. No provider call was made.');
  const requestId = String(requested.data);
  const prepared = await supabase.rpc('prepare_ai_agent_execution', { p_request_id: requestId });
  if (prepared.error || !prepared.data?.execution_id) throw new Error('The CV & LinkedIn request could not be prepared. No provider call was made.');
  const executionId = String(prepared.data.execution_id);
  const run = await supabase.functions.invoke('careerdev-ai-agent-runtime', { body: { request_id: requestId } });
  if (run.error || !run.data) throw new Error('The governed runtime returned no CV & LinkedIn result. Check AI Governance for the execution state.');
  if (run.data.status !== 'awaiting_human_review' || run.data.human_review_required !== true
    || run.data.human_review_gate !== true || run.data.human_approved !== false) {
    throw new Error('The runtime did not preserve the required human-review state. Do not use this result.');
  }
  return { ...run.data, output: validateOutput(run.data.output), requestId, executionId };
}
