import test from 'node:test';
import assert from 'node:assert/strict';
import { runCvLinkedInDraft } from '../lib/admin/cv-linkedin-operational.mjs';

const output = { cv_draft: 'CV DRAFT\nSynthetic CV text\n\nLINKEDIN DRAFT\nSynthetic LinkedIn text', quality_summary: 'Only supplied synthetic evidence was used; verify every claim.', review_required: true };
const payload = {
  blueprint: { source: 'synthetic', target_role: 'Programme Officer' },
  documents: [{ source: 'synthetic', document_type: 'career_evidence', content: 'Synthetic career evidence.' }],
  career_profile: { source: 'synthetic', summary: 'Synthetic programme professional.', experience: ['Supported a synthetic programme.'], skills: ['facilitation'] },
  service_request: { source: 'synthetic', deliverables: ['cv', 'linkedin'], target_role: 'Programme Officer' },
};

function mockedClient({ requestError = null, preparedError = null, runData = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'request_ai_agent_execution') return Promise.resolve({ data: requestError ? null : 'request-cv', error: requestError });
      if (name === 'prepare_ai_agent_execution') return Promise.resolve({ data: preparedError ? null : { execution_id: 'execution-cv' }, error: preparedError });
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: { invoke(name, options) { calls.push(['invoke', name, options]); return Promise.resolve({ data: runData, error: null }); } },
  };
}

test('CV & LinkedIn requests, prepares, and returns both review-gated draft sections', async () => {
  const client = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, estimated_cost_usd: 0.0002, output } });
  const result = await runCvLinkedInDraft(client, payload);
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[0][2].p_agent_key, 'cv_linkedin_ai');
  assert.equal(client.calls[0][2].p_workflow_key, 'cv_service_delivery');
  assert.equal(client.calls[0][2].p_trigger_source, 'staff_admin_operational');
  assert.equal(result.status, 'awaiting_human_review');
  assert.equal(result.output.review_required, true);
  assert.match(result.output.cv_draft, /LINKEDIN DRAFT/);
});

test('authorization and preparation failures stop before invoking the runtime', async () => {
  const denied = mockedClient({ requestError: { message: 'forbidden' } });
  await assert.rejects(runCvLinkedInDraft(denied, payload), /not authorized.*No provider call/i);
  assert.equal(denied.calls.length, 1);
  const notPrepared = mockedClient({ preparedError: { message: 'prepare failed' } });
  await assert.rejects(runCvLinkedInDraft(notPrepared, payload), /could not be prepared.*No provider call/i);
  assert.equal(notPrepared.calls.length, 2);
});

test('result validation blocks review bypass and incomplete CV or LinkedIn sections', async () => {
  const bypass = mockedClient({ runData: { status: 'completed', human_review_required: false, human_review_gate: false, human_approved: true, output } });
  await assert.rejects(runCvLinkedInDraft(bypass, payload), /did not preserve.*human-review/i);
  const missingSection = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output: { ...output, cv_draft: 'CV DRAFT only' } } });
  await assert.rejects(runCvLinkedInDraft(missingSection, payload), /incomplete or missing its human-review flag/i);
  const reviewFlag = mockedClient({ runData: { status: 'awaiting_human_review', human_review_required: true, human_review_gate: true, human_approved: false, output: { ...output, review_required: false } } });
  await assert.rejects(runCvLinkedInDraft(reviewFlag, payload), /incomplete or missing its human-review flag/i);
});
