const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOutput(output) {
  if (!isRecord(output)) throw new Error('The runtime returned no Career Discovery draft. Check AI Governance before retrying.');
  const expected = ['career_direction', 'target_roles', 'recommendations', 'gaps'];
  if (Object.keys(output).some((key) => !expected.includes(key)) || expected.some((key) => !(key in output))) {
    throw new Error('The Career Discovery result did not match its approved output contract. Do not use it.');
  }
  const validList = (value, { allowEmpty = false } = {}) => Array.isArray(value)
    && value.length <= 12
    && (allowEmpty || value.length > 0)
    && value.every((item) => typeof item === 'string' && item.trim() && item.length <= 1000);
  if (typeof output.career_direction !== 'string' || !output.career_direction.trim() || output.career_direction.length > 4000
    || !validList(output.target_roles, { allowEmpty: true })
    || !validList(output.recommendations)
    || !validList(output.gaps)) {
    throw new Error('The Career Discovery result contains invalid or empty review sections. Do not use it.');
  }
  return output;
}

export async function runCareerDiscoveryDraft(supabase, payload) {
  const requested = await supabase.rpc('request_ai_agent_execution', {
    p_agent_key: 'career_discovery_ai',
    p_workflow_key: 'career_profile_analysis',
    p_trigger_source: 'staff_admin_operational',
    p_input_payload: payload,
  });
  if (requested.error || !requested.data) throw new Error('The Career Discovery request was not authorized. No provider call was made.');
  const requestId = String(requested.data);

  const prepared = await supabase.rpc('prepare_ai_agent_execution', { p_request_id: requestId });
  if (prepared.error || !prepared.data?.execution_id) throw new Error('The Career Discovery request could not be prepared. No provider call was made.');
  const executionId = String(prepared.data.execution_id);

  const run = await supabase.functions.invoke('careerdev-ai-agent-runtime', { body: { request_id: requestId } });
  if (run.error || !run.data) throw new Error('The governed runtime returned no Career Discovery result. Check AI Governance for the execution state.');
  if (run.data.status !== 'awaiting_human_review' || run.data.human_review_required !== true
    || run.data.human_review_gate !== true || run.data.human_approved !== false) {
    throw new Error('The runtime did not preserve the required human-review state. Do not use this result.');
  }
  const output = validateOutput(run.data.output);
  return { ...run.data, output, requestId, executionId };
}
