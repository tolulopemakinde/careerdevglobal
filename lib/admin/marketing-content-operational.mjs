const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOutput(output) {
  if (!isRecord(output) || Object.keys(output).sort().join(',') !== 'content,cta,repurposing') {
    throw new Error('Marketing Content did not match its approved output contract. Do not use it.');
  }
  const validRepurposing = Array.isArray(output.repurposing) && output.repurposing.length >= 1 && output.repurposing.length <= 5
    && output.repurposing.every((item) => isRecord(item)
      && Object.keys(item).sort().join(',') === 'channel,draft'
      && typeof item.channel === 'string' && item.channel.trim() && item.channel.length <= 80
      && typeof item.draft === 'string' && item.draft.trim() && item.draft.length <= 2000);
  if (typeof output.cta !== 'string' || !output.cta.trim() || output.cta.length > 1200
    || typeof output.content !== 'string' || !output.content.trim() || output.content.length > 6000
    || !validRepurposing) {
    throw new Error('Marketing Content returned an incomplete or invalid draft. Do not use it.');
  }
  return output;
}

export async function runMarketingContentDraft(supabase, payload) {
  const requested = await supabase.rpc('request_ai_agent_execution', {
    p_agent_key: 'marketing_content_ai', p_workflow_key: 'content_creation',
    p_trigger_source: 'staff_admin_operational', p_input_payload: payload,
  });
  if (requested.error || !requested.data) throw new Error('The Marketing Content request was not authorized. No provider call was made.');
  const requestId = String(requested.data);
  const prepared = await supabase.rpc('prepare_ai_agent_execution', { p_request_id: requestId });
  if (prepared.error || !prepared.data?.execution_id) throw new Error('The Marketing Content request could not be prepared. No provider call was made.');
  const executionId = String(prepared.data.execution_id);
  const run = await supabase.functions.invoke('careerdev-ai-agent-runtime', { body: { request_id: requestId } });
  if (run.error || !run.data) throw new Error('The governed runtime returned no Marketing Content result. Check AI Governance for the execution state.');
  if (run.data.status !== 'awaiting_human_review' || run.data.human_review_required !== true
    || run.data.human_review_gate !== true || run.data.human_approved !== false) {
    throw new Error('The runtime did not preserve the required human-review state. Do not use this result.');
  }
  return { ...run.data, output: validateOutput(run.data.output), requestId, executionId };
}

export function marketingContentDraftToMarkdown(result) {
  const { output } = result;
  return [
    '# Marketing Content AI — draft for human review', '',
    'Status: Awaiting independent human review. Do not publish or send.', '',
    '## Main content', output.content, '',
    '## Call to action', output.cta, '',
    '## Repurposing', ...output.repurposing.map((item) => `### ${item.channel}\n${item.draft}`), '',
    '## Review notes',
    '- Draft generated from synthetic test input.',
    '- Verify factual claims and brand guidance before use.',
    '- No publication or external communication has occurred.', '',
  ].join('\n');
}
