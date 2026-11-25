const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateOutput(output) {
  if (!isRecord(output) || Object.keys(output).sort().join(',') !== 'next_steps,proposal,scope') {
    throw new Error('Sales Proposal did not match its approved output contract. Do not use it.');
  }
  const scope = output.scope;
  const validList = (value, min = 0) => Array.isArray(value) && value.length >= min && value.length <= 12
    && value.every((item) => typeof item === 'string' && item.trim() && item.length <= 1200);
  const steps = output.next_steps;
  const pricingPending = /pricing (?:is )?(?:pending|to be confirmed)|price (?:is )?(?:pending|to be confirmed)/i.test(output.proposal || '');
  const noUnsupportedPrice = !/(?:[$€£]\s?\d|\b(?:USD|NGN|EUR|GBP)\s?\d)/i.test(output.proposal || '');
  const noPromise = !/guarantee(?:d)?|will definitely|assured placement|promise(?:d)? (?:employment|funding|results|outcomes)/i.test(output.proposal || '');
  if (!isRecord(scope) || Object.keys(scope).sort().join(',') !== 'assumptions,exclusions,inclusions'
    || !validList(scope.inclusions, 1) || !validList(scope.exclusions, 1) || !validList(scope.assumptions)
    || typeof output.proposal !== 'string' || !output.proposal.trim() || output.proposal.length > 6000
    || !pricingPending || !noUnsupportedPrice || !noPromise
    || !Array.isArray(steps) || steps.length < 2 || steps.length > 8
    || steps.some((step) => typeof step !== 'string' || !step.trim() || step.length > 1200)
    || !steps.some((step) => /pricing|price/i.test(step) && /confirm|approve|authorize/i.test(step))
    || !steps.some((step) => /human|review|approval|approve/i.test(step))) {
    throw new Error('Sales Proposal returned unsafe or incomplete terms. Pricing must remain pending and human approval is required.');
  }
  return output;
}

export async function runSalesProposalDraft(supabase, payload) {
  const requested = await supabase.rpc('request_ai_agent_execution', {
    p_agent_key: 'sales_proposal_ai', p_workflow_key: 'proposal_generation',
    p_trigger_source: 'staff_admin_operational', p_input_payload: payload,
  });
  if (requested.error || !requested.data) throw new Error('The Sales Proposal request was not authorized. No provider call was made.');
  const requestId = String(requested.data);
  const prepared = await supabase.rpc('prepare_ai_agent_execution', { p_request_id: requestId });
  if (prepared.error || !prepared.data?.execution_id) throw new Error('The Sales Proposal request could not be prepared. No provider call was made.');
  const executionId = String(prepared.data.execution_id);
  const run = await supabase.functions.invoke('careerdev-ai-agent-runtime', { body: { request_id: requestId } });
  if (run.error || !run.data) throw new Error('The governed runtime returned no Sales Proposal result. Check AI Governance for the execution state.');
  if (run.data.status !== 'awaiting_human_review' || run.data.human_review_required !== true
    || run.data.human_review_gate !== true || run.data.human_approved !== false) {
    throw new Error('The runtime did not preserve the required human-review state. Do not use this result.');
  }
  return { ...run.data, output: validateOutput(run.data.output), requestId, executionId };
}

export function salesProposalDraftToMarkdown(result) {
  const { output } = result;
  const list = (values) => values.length ? values.map((item) => `- ${item}`).join('\n') : '- To be confirmed during discovery.';
  return [
    '# Sales Proposal AI — non-binding draft', '',
    'Status: Awaiting independent human review. Do not send or accept.',
    'Pricing is pending authorized human confirmation. This draft creates no commitment.', '',
    '## Proposed content', output.proposal, '',
    '## Proposed scope', `### Inclusions\n${list(output.scope.inclusions)}`, `### Exclusions\n${list(output.scope.exclusions)}`, `### Assumptions\n${list(output.scope.assumptions)}`, '',
    '## Next steps', list(output.next_steps), '',
    'A qualified human must verify scope, pricing, legal terms, and authority before any use.', '',
  ].join('\n');
}
