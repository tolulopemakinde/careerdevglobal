import test from 'node:test';
import assert from 'node:assert/strict';
import { runCareerDiscoveryDraft } from '../lib/admin/career-discovery-operational.mjs';

const output = { career_direction: 'Explore programme roles', target_roles: ['Programme Officer'], recommendations: ['Compare supplied skills with current role criteria.'], gaps: ['Role requirements and profile evidence remain unverified.'] };
const payload = { career_profile: { source: 'synthetic', education: 'BA Sociology', experience: '2 years programme support', skills: ['facilitation'] }, service_request: { source: 'synthetic', goal: 'Explore programme roles', target_roles: ['Programme Officer'] } };

function mockedClient({ requestError = null, preparedError = null, runData = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'request_ai_agent_execution') return Promise.resolve({ data: requestError ? null : 'request-1', error: requestError });
      if (name === 'prepare_ai_agent_execution') return Promise.resolve({ data: preparedError ? null : { execution_id: 'execution-1' }, error: preparedError });
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: runData, error: null }); } },
  };
}

test('Career Discovery requests, prepares, and returns only a review-gated operational draft', async () => {
  const client = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, estimated_cost_usd: 0.0001, output } });
  const result = await runCareerDiscoveryDraft(client, payload);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[0][1], 'request_ai_agent_execution');
  assert.equal(client.calls[0][2].p_agent_key, 'career_discovery_ai');
  assert.equal(client.calls[0][2].p_workflow_key, 'career_profile_analysis');
  assert.equal(client.calls[1][1], 'prepare_ai_agent_execution');
  assert.equal(client.calls[2][0], 'invoke');
  assert.equal(result.requestId, 'request-1');
  assert.equal(result.executionId, 'execution-1');
  assert.equal(result.output, output);
});

test('authorization or preparation failure stops before any runtime invocation', async () => {
  const requestClient = mockedClient({ requestError: { message: 'forbidden' } });
  await assert.rejects(runCareerDiscoveryDraft(requestClient, payload), /not authorized.*No provider call/i);
  assert.equal(requestClient.calls.length, 1);
  const prepareClient = mockedClient({ preparedError: { message: 'prepare failed' } });
  await assert.rejects(runCareerDiscoveryDraft(prepareClient, payload), /could not be prepared.*No provider call/i);
  assert.equal(prepareClient.calls.length, 2);
});

test('runtime response must retain human review and the strict Career Discovery output contract', async () => {
  const bypass = mockedClient({ runData: { status: 'completed', human_review_required: false, human_review_gate: false, human_approved: true, output } });
  await assert.rejects(runCareerDiscoveryDraft(bypass, payload), /did not preserve.*human-review/i);
  const invalid = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output: { ...output, target_roles: ['x'.repeat(1001)] } } });
  await assert.rejects(runCareerDiscoveryDraft(invalid, payload), /invalid or empty review sections/i);
});
