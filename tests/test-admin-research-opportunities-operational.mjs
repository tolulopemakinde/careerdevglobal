import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchOpportunitiesDraft, researchDraftToMarkdown } from '../lib/admin/research-opportunities-operational.mjs';

const payload = {
  research_scope: { source: 'synthetic', keywords: 'career fellowship', opportunity_type: 'fellowship', geography: 'Nigeria', sources: [{ source: 'synthetic', title: 'Example Fellowship', excerpt: 'Synthetic excerpt with unverified program details.', deadline: 'December 15, 2026' }] },
  target_profile: { source: 'synthetic', description: 'Synthetic Nigeria-based early-career applicant profile.' },
};
const output = { sources: ['synthetic://source-1'], deadlines: [{ deadline: 'December 15, 2026', verification_status: 'unverified', source: 'synthetic://source-1' }], opportunities: [{ title: 'Example Fellowship', summary: 'Synthetic summary from the supplied excerpt only.', source_url: 'synthetic://source-1', deadline: 'December 15, 2026', verification_status: 'unverified' }] };

function mockedClient({ requestError = null, preparedError = null, runData = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'request_ai_agent_execution') return Promise.resolve({ data: requestError ? null : 'request-research', error: requestError });
      if (name === 'prepare_ai_agent_execution') return Promise.resolve({ data: preparedError ? null : { execution_id: 'execution-research' }, error: preparedError });
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: runData, error: null }); } },
  };
}

test('Research & Opportunities uses the fixed workflow and returns synthetic unverified output', async () => {
  const client = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, estimated_cost_usd: 0.0002, output } });
  const result = await runResearchOpportunitiesDraft(client, payload);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[0][2].p_agent_key, 'research_opportunities_ai');
  assert.equal(client.calls[0][2].p_workflow_key, 'opportunity_research');
  assert.equal(client.calls[0][2].p_trigger_source, 'staff_admin_operational');
  assert.match(researchDraftToMarkdown(result), /did not search the web/);
  assert.match(researchDraftToMarkdown(result), /All content below is synthetic and unverified/);
});

test('authorization and preparation failures stop before the runtime call', async () => {
  const denied = mockedClient({ requestError: { message: 'forbidden' } });
  await assert.rejects(runResearchOpportunitiesDraft(denied, payload), /not authorized.*No provider call/i);
  assert.equal(denied.calls.length, 1);
  const notPrepared = mockedClient({ preparedError: { message: 'prepare failed' } });
  await assert.rejects(runResearchOpportunitiesDraft(notPrepared, payload), /could not be prepared.*No provider call/i);
  assert.equal(notPrepared.calls.length, 2);
});

test('the handoff rejects live or invented source claims and review bypasses', async () => {
  const bypass = mockedClient({ runData: { status: 'completed', human_review_required: false, human_review_gate: false, human_approved: true, output } });
  await assert.rejects(runResearchOpportunitiesDraft(bypass, payload), /did not preserve.*human-review/i);
  const verified = { ...output, deadlines: [{ ...output.deadlines[0], verification_status: 'verified' }] };
  const unsafe = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output: verified } });
  await assert.rejects(runResearchOpportunitiesDraft(unsafe, payload), /must refer only to supplied synthetic evidence and remain unverified/i);
});
