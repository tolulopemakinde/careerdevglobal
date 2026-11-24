import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createExecutiveReview, executiveReviewToMarkdown, requestCEOIndependentReview, runCEOOperationsDraft } from '../lib/admin/ceo-operations-workspace.mjs';

const fixture = { period: 'synthetic-Q1', target: 15, completed: 12, qualityScore: 82 };

test('aggregate review calculates completion and flags shortfalls for human review', () => {
  const review = createExecutiveReview(fixture, '2026-11-24T00:00:00.000Z');
  assert.equal(review.completionRate, 80);
  assert.equal(review.status, 'testing_preview');
  assert.equal(review.humanReviewRequired, true);
  assert.ok(review.risks.some((risk) => risk.includes('below the entered target')));
  assert.match(executiveReviewToMarkdown(review), /does not assess individual staff performance/);
});

test('invalid aggregate values are rejected', () => {
  assert.throws(() => createExecutiveReview({ ...fixture, completed: 16 }), /valid aggregate counts/);
  assert.throws(() => createExecutiveReview({ ...fixture, qualityScore: 101 }), /from 0 to 100/);
  assert.throws(() => createExecutiveReview({ ...fixture, period: '' }), /reporting period is required/);
});

test('mocked operational request traverses authorization, preparation, runtime, and review state', async () => {
  const calls = [];
  const mock = {
    rpc: async (name, args) => {
      calls.push({ kind: 'rpc', name, args });
      if (name === 'request_ai_agent_execution') return { data: 'request-synthetic-1', error: null };
      if (name === 'prepare_ai_agent_execution') return { data: { execution_id: 'execution-synthetic-1' }, error: null };
      if (name === 'request_ai_human_approval') return { data: 'approval-synthetic-1', error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
    functions: { invoke: async (name, options) => {
      calls.push({ kind: 'invoke', name, options });
      return { data: { status: 'awaiting_human_review', human_review_required: true, estimated_cost_usd: 0.00001, output: { risks: ['Synthetic risk'], actions: ['Check source data'], insights: ['Synthetic insight'] } }, error: null };
    } },
  };
  const result = await runCEOOperationsDraft(mock, { quality: { delivery_score: 0.8 }, outcomes: { completed: 8, target: 10 }, performance_data: { reporting_period: '2026-Q1' } });
  assert.equal(result.requestId, 'request-synthetic-1');
  assert.equal(result.executionId, 'execution-synthetic-1');
  assert.equal(result.human_review_required, true);
  assert.deepEqual(calls.map((call) => call.name), ['request_ai_agent_execution', 'prepare_ai_agent_execution', 'careerdev-ai-agent-runtime']);
  assert.equal(calls[0].args.p_trigger_source, 'staff_admin_operational');
  assert.deepEqual(calls[2].options.body, { request_id: 'request-synthetic-1' });
  assert.equal(await requestCEOIndependentReview(mock, result), 'approval-synthetic-1');
  assert.equal(calls[3].name, 'request_ai_human_approval');
});

test('mocked failures stop before runtime or reject a result that bypasses review', async () => {
  let invokeCount = 0;
  const denied = { rpc: async () => ({ data: null, error: new Error('denied') }), functions: { invoke: async () => { invokeCount += 1; } } };
  await assert.rejects(runCEOOperationsDraft(denied, {}), /could not be authorized/);
  assert.equal(invokeCount, 0);

  const reviewBypass = {
    rpc: async (name) => name === 'request_ai_agent_execution' ? { data: 'request-1' } : { data: { execution_id: 'execution-1' } },
    functions: { invoke: async () => { invokeCount += 1; return { data: { status: 'completed', human_review_required: false }, error: null }; } },
  };
  await assert.rejects(runCEOOperationsDraft(reviewBypass, {}), /did not preserve the required human-review state/);
  assert.equal(invokeCount, 1);
});

test('workspace is Admin-only and the operational Groq path is gated by registry state and human review', async () => {
  const ui = await readFile(new URL('../app/admin/ceo-operations-workspace.tsx', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  const flow = await readFile(new URL('../lib/admin/ceo-operations-workspace.mjs', import.meta.url), 'utf8');
  assert.match(admin, /a\.agent_key==='ceo_operations_ai'&&isAdmin/);
  assert.match(admin, /ceoOperationsOpen&&isAdmin&&<CEOOperationsWorkspace/);
  assert.match(ui, /Create aggregate review preview/);
  assert.match(ui, /agentStatus === 'live' && agentActive && humanApprovalRequired/);
  assert.match(flow, /request_ai_agent_execution/);
  assert.match(flow, /prepare_ai_agent_execution/);
  assert.match(flow, /functions\.invoke\("careerdev-ai-agent-runtime"/);
  assert.match(flow, /run\.data\.status !== "awaiting_human_review"/);
  assert.match(flow, /request_ai_human_approval/);
  assert.doesNotMatch(ui, /\bfetch\s*\(|api\.groq\.com|api\.openai\.com/);
});
