const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOutput(output, consentStatus) {
  if (!isRecord(output) || Object.keys(output).sort().join(',') !== 'next_action,qualification,service_fit') {
    throw new Error('The Lead Generation result did not match its approved output contract. Do not use it.');
  }
  const q = output.qualification;
  const itemsValid = (items) => Array.isArray(items) && items.length <= 12 && items.every((item) => typeof item === 'string' && item.trim() && item.length <= 1000);
  if (typeof output.next_action !== 'string' || !output.next_action.trim() || output.next_action.length > 4000
    || typeof output.service_fit !== 'string' || !output.service_fit.trim() || output.service_fit.length > 4000
    || !isRecord(q) || Object.keys(q).sort().join(',') !== 'evidence,missing,status'
    || !['possible_fit', 'incomplete', 'not_fit'].includes(q.status)
    || !itemsValid(q.missing) || !itemsValid(q.evidence)) {
    throw new Error('The Lead Generation result is incomplete or invalid. Do not use it.');
  }
  if (consentStatus === 'do_not_contact' && !/do not contact|no outreach|do not outreach/i.test(output.next_action)) {
    throw new Error('The result did not preserve the do-not-contact boundary. Do not use it.');
  }
  if (consentStatus !== 'consent_confirmed' && consentStatus !== 'do_not_contact' && !/consent|permission/i.test(output.next_action)) {
    throw new Error('The result omitted the required consent/permission review. Do not use it.');
  }
  return output;
}

export async function runLeadGenerationDraft(supabase, payload) {
  const requested = await supabase.rpc('request_ai_agent_execution', {
    p_agent_key: 'lead_generation_ai', p_workflow_key: 'lead_qualification',
    p_trigger_source: 'staff_admin_operational', p_input_payload: payload,
  });
  if (requested.error || !requested.data) throw new Error('The Lead Generation request was not authorized. No provider call was made.');
  const requestId = String(requested.data);
  const prepared = await supabase.rpc('prepare_ai_agent_execution', { p_request_id: requestId });
  if (prepared.error || !prepared.data?.execution_id) throw new Error('The Lead Generation request could not be prepared. No provider call was made.');
  const executionId = String(prepared.data.execution_id);
  const run = await supabase.functions.invoke('careerdev-ai-agent-runtime', { body: { request_id: requestId } });
  if (run.error || !run.data) throw new Error('The governed runtime returned no Lead Generation result. Check AI Governance for the execution state.');
  if (run.data.status !== 'awaiting_human_review' || run.data.human_review_required !== true
    || run.data.human_review_gate !== true || run.data.human_approved !== false) {
    throw new Error('The runtime did not preserve the required human-review state. Do not use this result.');
  }
  return { ...run.data, output: validateOutput(run.data.output, payload?.lead?.consent_status), requestId, executionId };
}
