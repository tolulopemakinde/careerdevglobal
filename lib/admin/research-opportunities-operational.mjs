const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOutput(output, payload) {
  if (!isRecord(output) || Object.keys(output).sort().join(',') !== 'deadlines,opportunities,sources') {
    throw new Error('Research & Opportunities did not match its approved output contract. Do not use it.');
  }
  const sourceById = new Map(payload.research_scope.sources.map((source, index) => [`synthetic://source-${index + 1}`, source]));
  const ids = new Set(sourceById.keys());
  const validDeadlines = Array.isArray(output.deadlines) && output.deadlines.length <= 5
    && output.deadlines.every((item) => isRecord(item) && Object.keys(item).sort().join(',') === 'deadline,source,verification_status'
      && typeof item.deadline === 'string' && item.deadline.length <= 80 && item.verification_status === 'unverified'
      && ids.has(item.source) && item.deadline === sourceById.get(item.source)?.deadline);
  const validOpportunities = Array.isArray(output.opportunities) && output.opportunities.length <= 5
    && output.opportunities.every((item) => isRecord(item) && Object.keys(item).sort().join(',') === 'deadline,source_url,summary,title,verification_status'
      && typeof item.title === 'string' && item.title.trim() && item.title.length <= 500
      && typeof item.summary === 'string' && item.summary.trim() && item.summary.length <= 2000
      && ids.has(item.source_url) && item.title === sourceById.get(item.source_url)?.title
      && typeof item.deadline === 'string' && item.deadline.length <= 80
      && item.deadline === sourceById.get(item.source_url)?.deadline
      && item.verification_status === 'unverified');
  if (!Array.isArray(output.sources) || output.sources.length < 1 || output.sources.length > 5
    || output.sources.some((source) => !ids.has(source)) || !validDeadlines || !validOpportunities) {
    throw new Error('Research output must refer only to supplied synthetic evidence and remain unverified. Do not use it.');
  }
  return output;
}

export async function runResearchOpportunitiesDraft(supabase, payload) {
  const requested = await supabase.rpc('request_ai_agent_execution', {
    p_agent_key: 'research_opportunities_ai', p_workflow_key: 'opportunity_research',
    p_trigger_source: 'staff_admin_operational', p_input_payload: payload,
  });
  if (requested.error || !requested.data) throw new Error('The research request was not authorized. No provider call was made.');
  const requestId = String(requested.data);
  const prepared = await supabase.rpc('prepare_ai_agent_execution', { p_request_id: requestId });
  if (prepared.error || !prepared.data?.execution_id) throw new Error('The research request could not be prepared. No provider call was made.');
  const executionId = String(prepared.data.execution_id);
  const run = await supabase.functions.invoke('careerdev-ai-agent-runtime', { body: { request_id: requestId } });
  if (run.error || !run.data) throw new Error('The governed runtime returned no Research & Opportunities result. Check AI Governance for the execution state.');
  if (run.data.status !== 'awaiting_human_review' || run.data.human_review_required !== true
    || run.data.human_review_gate !== true || run.data.human_approved !== false) {
    throw new Error('The runtime did not preserve the required human-review state. Do not use this result.');
  }
  return { ...run.data, output: validateOutput(run.data.output, payload), requestId, executionId };
}

export function researchDraftToMarkdown(result) {
  const { output } = result;
  return [
    '# Research & Opportunities AI — synthetic draft', '',
    'Status: Awaiting independent human review. All content below is synthetic and unverified.',
    'This test did not search the web or confirm a real source, opportunity, eligibility rule, or deadline.', '',
    '## Synthetic source references', ...output.sources.map((source) => `- ${source}`), '',
    '## Synthetic opportunities', ...output.opportunities.flatMap((item) => [
      `### ${item.title}`, item.summary, `Source: ${item.source_url}`, `Deadline: ${item.deadline || 'not supplied'}`, `Verification: ${item.verification_status}`, '',
    ]),
    '## Synthetic deadlines', ...output.deadlines.map((item) => `- ${item.deadline || 'not supplied'} — ${item.verification_status} — ${item.source}`), '',
    'Human review must verify actual primary sources and dates before any use.', '',
  ].join('\n');
}
