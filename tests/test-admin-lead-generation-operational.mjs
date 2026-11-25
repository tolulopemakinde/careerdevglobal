import test from 'node:test';
import assert from 'node:assert/strict';
import { runLeadGenerationDraft } from '../lib/admin/lead-generation-operational.mjs';

const output = { next_action: 'Confirm consent and permission before any contact.', service_fit: 'Possible fit from synthetic needs; unverified.', qualification: { status: 'incomplete', missing: ['consent confirmation'], evidence: ['Synthetic needs align with a listed service.'] } };
const payload = { lead: { source: 'synthetic', role_title: 'Operations Director', organization_type: 'Nonprofit', needs: ['career transition workshops'], consent_status: 'unknown' }, service_catalog: [{ source: 'synthetic', service_name: 'Career development workshop', description: 'Group career planning support.' }] };

function mockedClient({ requestError = null, preparedError = null, runData = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'request_ai_agent_execution') return Promise.resolve({ data: requestError ? null : 'request-lead', error: requestError });
      if (name === 'prepare_ai_agent_execution') return Promise.resolve({ data: preparedError ? null : { execution_id: 'execution-lead' }, error: preparedError });
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: runData, error: null }); } },
  };
}

test('Lead Generation requests, prepares, and returns a review-gated synthetic qualification draft', async () => {
  const client = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, estimated_cost_usd: 0.0002, output } });
  const result = await runLeadGenerationDraft(client, payload);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[0][2].p_agent_key, 'lead_generation_ai');
  assert.equal(client.calls[0][2].p_workflow_key, 'lead_qualification');
  assert.equal(client.calls[0][2].p_trigger_source, 'staff_admin_operational');
  assert.equal(result.output.qualification.status, 'incomplete');
  assert.equal(result.status, 'awaiting_human_review');
});

test('authorization and preparation failures stop before invoking the runtime', async () => {
  const denied = mockedClient({ requestError: { message: 'forbidden' } });
  await assert.rejects(runLeadGenerationDraft(denied, payload), /not authorized.*No provider call/i);
  assert.equal(denied.calls.length, 1);
  const notPrepared = mockedClient({ preparedError: { message: 'prepare failed' } });
  await assert.rejects(runLeadGenerationDraft(notPrepared, payload), /could not be prepared.*No provider call/i);
  assert.equal(notPrepared.calls.length, 2);
});

test('result must retain the review and permission boundaries', async () => {
  const bypass = mockedClient({ runData: { status: 'completed', human_review_required: false, human_review_gate: false, human_approved: true, output } });
  await assert.rejects(runLeadGenerationDraft(bypass, payload), /did not preserve.*human-review/i);
  const noConsent = { ...payload, lead: { ...payload.lead, consent_status: 'unknown' } };
  const unsafe = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output: { ...output, next_action: 'Send a LinkedIn message now.' } } });
  await assert.rejects(runLeadGenerationDraft(unsafe, noConsent), /required consent\/permission review/i);
  const doNotContact = { ...payload, lead: { ...payload.lead, consent_status: 'do_not_contact' } };
  const unsafeContact = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output } });
  await assert.rejects(runLeadGenerationDraft(unsafeContact, doNotContact), /do-not-contact boundary/i);
});
