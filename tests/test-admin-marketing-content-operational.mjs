import test from 'node:test';
import assert from 'node:assert/strict';
import { runMarketingContentDraft, marketingContentDraftToMarkdown } from '../lib/admin/marketing-content-operational.mjs';

const payload = { topic: 'Synthetic career planning', audience: 'Synthetic early-career audience', brand_guidance: 'Practical language. Requested call to action: Explore resources.' };
const output = { cta: 'Explore the career resources.', content: 'A practical synthetic draft with no factual claims.', repurposing: [{ channel: 'LinkedIn', draft: 'A concise synthetic post.' }] };

function mockedClient({ requestError = null, preparedError = null, runData = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'request_ai_agent_execution') return Promise.resolve({ data: requestError ? null : 'request-marketing', error: requestError });
      if (name === 'prepare_ai_agent_execution') return Promise.resolve({ data: preparedError ? null : { execution_id: 'execution-marketing' }, error: preparedError });
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: runData, error: null }); } },
  };
}

test('Marketing Content requests the fixed workflow and returns a review-gated draft', async () => {
  const client = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, estimated_cost_usd: 0.0002, output } });
  const result = await runMarketingContentDraft(client, payload);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[0][2].p_agent_key, 'marketing_content_ai');
  assert.equal(client.calls[0][2].p_workflow_key, 'content_creation');
  assert.equal(client.calls[0][2].p_trigger_source, 'staff_admin_operational');
  assert.match(marketingContentDraftToMarkdown(result), /Awaiting independent human review/);
  assert.match(marketingContentDraftToMarkdown(result), /Do not publish or send/);
});

test('authorization and preparation failures stop before the runtime call', async () => {
  const denied = mockedClient({ requestError: { message: 'forbidden' } });
  await assert.rejects(runMarketingContentDraft(denied, payload), /not authorized.*No provider call/i);
  assert.equal(denied.calls.length, 1);
  const notPrepared = mockedClient({ preparedError: { message: 'prepare failed' } });
  await assert.rejects(runMarketingContentDraft(notPrepared, payload), /could not be prepared.*No provider call/i);
  assert.equal(notPrepared.calls.length, 2);
});

test('the handoff rejects review bypasses and malformed repurposing output', async () => {
  const bypass = mockedClient({ runData: { status: 'completed', human_review_required: false, human_review_gate: false, human_approved: true, output } });
  await assert.rejects(runMarketingContentDraft(bypass, payload), /did not preserve.*human-review/i);
  const malformed = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output: { ...output, repurposing: [{ channel: 'LinkedIn', draft: '' }] } } });
  await assert.rejects(runMarketingContentDraft(malformed, payload), /incomplete or invalid draft/i);
});
