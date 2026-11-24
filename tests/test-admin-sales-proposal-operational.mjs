import test from 'node:test';
import assert from 'node:assert/strict';
import { runSalesProposalDraft, salesProposalDraftToMarkdown } from '../lib/admin/sales-proposal-operational.mjs';

const payload = {
  lead: { source: 'synthetic', organization_type: 'Nonprofit', decision_role: 'Program Director' },
  needs: { source: 'synthetic', summary: 'Improve career readiness workshops.', objectives: ['Clarify workshop outcomes'], deliverables: ['Facilitator guide'], timeline: 'Eight weeks' },
  service: { source: 'synthetic', service_name: 'Career readiness workshop', description: 'A synthetic workshop design service.' },
};
const output = { scope: { inclusions: ['Workshop design'], exclusions: ['Outcomes are not guaranteed.'], assumptions: ['Client provides synthetic materials.'] }, proposal: 'We propose the listed workshop design. Pricing is pending authorized confirmation.', next_steps: ['Confirm pricing with an authorized approver.', 'Complete human review before sharing.'] };

function mockedClient({ requestError = null, preparedError = null, runData = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'request_ai_agent_execution') return Promise.resolve({ data: requestError ? null : 'request-sales', error: requestError });
      if (name === 'prepare_ai_agent_execution') return Promise.resolve({ data: preparedError ? null : { execution_id: 'execution-sales' }, error: preparedError });
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: runData, error: null }); } },
  };
}

test('Sales Proposal uses its fixed workflow and returns a non-binding review-gated draft', async () => {
  const client = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, estimated_cost_usd: 0.0002, output } });
  const result = await runSalesProposalDraft(client, payload);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[0][2].p_agent_key, 'sales_proposal_ai');
  assert.equal(client.calls[0][2].p_workflow_key, 'proposal_generation');
  assert.equal(client.calls[0][2].p_trigger_source, 'staff_admin_operational');
  assert.match(salesProposalDraftToMarkdown(result), /Pricing is pending authorized human confirmation/);
  assert.match(salesProposalDraftToMarkdown(result), /Do not send or accept/);
});

test('authorization and preparation failures stop before the runtime call', async () => {
  const denied = mockedClient({ requestError: { message: 'forbidden' } });
  await assert.rejects(runSalesProposalDraft(denied, payload), /not authorized.*No provider call/i);
  assert.equal(denied.calls.length, 1);
  const notPrepared = mockedClient({ preparedError: { message: 'prepare failed' } });
  await assert.rejects(runSalesProposalDraft(notPrepared, payload), /could not be prepared.*No provider call/i);
  assert.equal(notPrepared.calls.length, 2);
});

test('the handoff rejects unsupported price, guarantee, or review bypass output', async () => {
  const bypass = mockedClient({ runData: { status: 'completed', human_review_required: false, human_review_gate: false, human_approved: true, output } });
  await assert.rejects(runSalesProposalDraft(bypass, payload), /did not preserve.*human-review/i);
  const priced = { ...output, proposal: 'The fee is USD 500. Pricing is pending authorized confirmation.' };
  const unsafe = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output: priced } });
  await assert.rejects(runSalesProposalDraft(unsafe, payload), /Pricing must remain pending and human approval is required/);
});
