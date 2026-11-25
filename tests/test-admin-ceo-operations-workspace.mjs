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
      return { data: { status: 'awaiting_human_review', execution_id: 'execution-synthetic-1', human_review_required: true, usage_event_persisted: true, estimated_cost_usd: 0.00001, output: { risks: ['Synthetic risk'], actions: ['Check source data'], insights: ['Synthetic insight'] } }, error: null };
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

test('operational aggregate findings and risks come from inputs even when Groq returns extra prose', async () => {
  const { createCEOAggregateReview, finalizeCEOAggregateReview } = await import('../supabase/functions/careerdev-ai-agent-runtime/staff-admin-operational-policy.mjs');
  const review = createCEOAggregateReview({
    outcomes: { completed: 8, target: 10 },
    quality: { delivery_score: 0.64 },
    performance_data: { reporting_period: '2026-Q1' },
  });
  const result = finalizeCEOAggregateReview(review, {
    priorities: ['quality', 'delivery', 'evidence'],
    insights: ['unsupported individual claim'],
  });
  assert.match(result.insights[0], /2026-Q1.*8 were completed \(80\.0% of the plan\)/);
  assert.match(result.insights[1], /64%/);
  assert.match(result.risks[0], /2 planned outcomes remained incomplete/);
  assert.match(result.risks[1], /70% review threshold/);
  assert.match(result.actions[0], /quality score/);
  assert.match(result.actions[1], /unfinished planned outcomes/);
  assert.doesNotMatch(JSON.stringify(result), /unsupported individual claim/);
  assert.equal(finalizeCEOAggregateReview(review, { priorities: ['quality', 'quality', 'evidence'] }), null);
  assert.equal(finalizeCEOAggregateReview(review, { priorities: ['monitor', 'delivery', 'evidence'] }), null);
  const noThresholdFlags = createCEOAggregateReview({
    outcomes: { completed: 10, target: 10 },
    quality: { delivery_score: 0.7 },
    performance_data: { reporting_period: '2026-Q1' },
  });
  assert.deepEqual(noThresholdFlags.priorities, ['monitor', 'evidence']);
});

test('operator sees a provider failure with the execution ID and an actionable explanation', async () => {
  const client = {
    rpc: async (name) => name === 'request_ai_agent_execution'
      ? { data: 'request-1' }
      : { data: { execution_id: 'execution-1' } },
    functions: {
      invoke: async () => ({
        error: { context: Response.json({ code: 'STAFF_ADMIN_PROVIDER_NOT_READY' }, { status: 503 }) },
      }),
    },
  };
  await assert.rejects(runCEOOperationsDraft(client, {}), /Groq setup is incomplete.*execution execution-1/);
  client.functions.invoke = async () => ({
    data: { execution_id: 'other', status: 'awaiting_human_review', human_review_required: true },
  });
  await assert.rejects(runCEOOperationsDraft(client, {}), /did not return a valid draft for execution execution-1/);
});

test('operational client reaches the Edge handler, records the Groq draft, and distinguishes denial and failure', async (t) => {
  const { registerHooks } = await import('node:module');
  const { sendStaffAdminGroqRequest } = await import('../supabase/functions/careerdev-ai-agent-runtime/staff-admin-groq-transport.mjs');
  const payload = { outcomes: { completed: 8, target: 10 }, quality: { delivery_score: 0.64 }, performance_data: { reporting_period: '2026-Q1' } };
  const env = {
    SUPABASE_URL: 'https://supabase.example.test',
    SUPABASE_ANON_KEY: 'synthetic-anon',
    GROQ_API_KEY: 'synthetic-groq',
    STAFF_ADMIN_GROQ_MODEL: 'openai/gpt-oss-20b',
    STAFF_ADMIN_GROQ_INPUT_USD_PER_MILLION_TOKENS: '0.10',
    STAFF_ADMIN_GROQ_OUTPUT_USD_PER_MILLION_TOKENS: '0.50',
    STAFF_ADMIN_GROQ_MONTHLY_SPEND_LIMIT_USD: '1',
    STAFF_ADMIN_GROQ_HARD_LIMIT_CONFIRMED: 'true',
  };
  const registry = { agent_key: 'ceo_operations_ai', name: 'CEO Operations', status: 'live', active: true, human_approval_required: true, owner_role: 'admin' };
  const request = { id: 'request-1', execution_id: 'execution-1', workflow_id: 'workflow-1', trigger_source: 'staff_admin_operational', status: 'prepared', requested_by: 'synthetic-user', input_payload: payload };
  const operations = [];
  let role = 'admin', handler, providerFailure = false;
  const dataByTable = {
    ai_agent_execution_requests: request,
    ai_agent_executions: { id: 'execution-1', agent_id: 'ceo-1', workflow_id: 'workflow-1' },
    ai_agent_registry: registry,
    ai_agent_workflows: { workflow_key: 'executive_performance_review', active: true },
    ai_agent_configuration_snapshots: [{ config_type: 'prompt', configuration: {} }],
  };
  const database = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
    from(table) {
      const data = table === 'profiles' ? { role, status: 'active' } : dataByTable[table];
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }), then: (resolve) => resolve({ data }) }) }),
        insert: async (row) => { operations.push({ table, row }); return {}; },
        update: (row) => ({ eq: async () => { operations.push({ table, row }); return {}; } }),
      };
    },
    async rpc(name, args) {
      operations.push({ name, args });
      if (name === 'request_ai_agent_execution') return { data: request.id };
      if (name === 'prepare_ai_agent_execution') return { data: { execution_id: request.execution_id } };
      if (name === 'transition_ai_agent_execution') return { data: { status: args.p_status } };
      if (name === 'set_ceo_operations_release') return {
        data: { status: args.p_action === 'activate' ? 'live' : 'testing', active: args.p_action === 'activate', human_approval_required: true, changed: true, event_id: 'release-event-1' },
      };
      throw new Error(`Unexpected RPC ${name}`);
    },
    functions: {
      async invoke(_name, { body }) {
        const response = await handler(new Request('https://edge.example.test', {
          method: 'POST',
          headers: { Authorization: 'Bearer synthetic-user' },
          body: JSON.stringify(body),
        }));
        return response.ok ? { data: await response.json() } : { error: { context: response } };
      },
    },
  };
  const runtimeUrl = new URL('../supabase/functions/careerdev-ai-agent-runtime/index.ts', import.meta.url).href;
  globalThis.Deno = {
    env: { get: (key) => env[key] ?? (key.startsWith('SUPABASE_') && key.endsWith('_KEY') ? 'synthetic-key' : undefined) },
    serve: (callback) => { handler = callback; },
  };
  globalThis.ceoRuntimeFixtures = {
    createClient: () => database,
    sendStaffAdminGroqRequest: (options) => sendStaffAdminGroqRequest({
      ...options,
      fetchImpl: async (_url, init) => {
        operations.push({ providerRequest: JSON.parse(init.body) });
        if (providerFailure) throw new Error('mock timeout');
        return Response.json({
          choices: [{ message: { content: JSON.stringify({ priorities: ['quality', 'delivery', 'evidence'] }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 10 },
        });
      },
    }),
  };
  const substitutes = {
    'edge-runtime': 'export {}',
    '@supabase/supabase-js': 'export const { createClient } = globalThis.ceoRuntimeFixtures;',
    './staff-admin-groq-transport.mjs': 'export const { sendStaffAdminGroqRequest } = globalThis.ceoRuntimeFixtures;',
  };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const substitute = context.parentURL === runtimeUrl && substitutes[specifier];
      return substitute
        ? { url: `data:text/javascript,${encodeURIComponent(substitute)}`, shortCircuit: true }
        : next(specifier, context);
    },
  });
  t.after(() => {
    hooks.deregister();
    delete globalThis.Deno;
    delete globalThis.ceoRuntimeFixtures;
  });
  await import(runtimeUrl);

  const readiness = await database.functions.invoke('', { body: { action: 'check_ceo_operations_readiness' } });
  assert.deepEqual(readiness.data, { ready: true, checks: {
    credentials_configured: true, approved_model: true, rates_configured: true, spend_limit_recorded: true,
  } });
  assert.deepEqual(operations, []);
  role = 'staff';
  const deniedReadiness = await database.functions.invoke('', { body: { action: 'check_ceo_operations_readiness' } });
  assert.equal(deniedReadiness.error.context.status, 403);
  role = 'admin';
  env.STAFF_ADMIN_GROQ_HARD_LIMIT_CONFIRMED = 'false';
  const uncheckedLimit = await database.functions.invoke('', { body: { action: 'check_ceo_operations_readiness' } });
  assert.equal(uncheckedLimit.data.ready, false);
  assert.equal(uncheckedLimit.data.checks.spend_limit_recorded, false);
  env.STAFF_ADMIN_GROQ_HARD_LIMIT_CONFIRMED = 'true';
  assert.deepEqual(operations, []);

  const api = (body) => database.functions.invoke('', { body });
  const release = {
    action: 'set_ceo_operations_release',
    release_action: 'activate',
    expected_status: 'testing',
    expected_active: false,
    verification_confirmed: true,
    verification_reference: 'synthetic-check-42',
    actor_id: 'untrusted-override',
  };
  role = 'staff';
  assert.equal((await api(release)).error.context.status, 403);
  role = 'admin';
  assert.equal((await api({ ...release, verification_confirmed: false })).error.context.status, 400);
  env.STAFF_ADMIN_GROQ_HARD_LIMIT_CONFIRMED = 'false';
  assert.equal((await api(release)).error.context.status, 409);
  assert.deepEqual(operations, []);
  const disabled = await api({ ...release, release_action: 'deactivate', expected_status: 'live', expected_active: true });
  assert.equal(disabled.data.active, false);
  assert.equal(operations[0].args.p_readiness_passed, false);
  assert.equal(operations[0].args.p_verification_reference, null);
  env.STAFF_ADMIN_GROQ_HARD_LIMIT_CONFIRMED = 'true';
  const enabled = await api(release);
  assert.equal(enabled.data.event_id, 'release-event-1');
  assert.equal(enabled.data.human_approval_required, true);
  assert.deepEqual(operations[1], { name: 'set_ceo_operations_release', args: {
    p_actor_id: 'synthetic-user', p_action: 'activate', p_expected_status: 'testing', p_expected_active: false,
    p_readiness_passed: true, p_verification_confirmed: true, p_verification_reference: 'synthetic-check-42',
  } });
  assert.equal(operations.some(operation => operation.providerRequest), false);
  operations.length = 0;

  const result = await runCEOOperationsDraft(database, payload);
  assert.equal(result.usage_event_persisted, true);
  assert.equal(result.estimated_cost_usd, 0.000015);
  assert.match(result.output.insights[0], /8 were completed/);
  assert.match(result.output.actions[0], /quality score/);
  const usage = operations.find((op) => op.table === 'ai_usage_events').row;
  assert.equal(usage.run_id, result.executionId);
  assert.equal(usage.provider, 'groq');
  assert.equal(usage.model_name, 'openai/gpt-oss-20b');
  assert.equal(usage.total_tokens, 110);
  assert.equal(operations.find((op) => op.table === 'ai_agent_executions').row.status, 'awaiting_human_review');
  assert.deepEqual(operations.filter((op) => op.name === 'transition_ai_agent_execution').map((op) => op.args.p_status), ['running', 'awaiting_human_review']);
  assert.equal(operations[0].args.p_trigger_source, 'staff_admin_operational');

  operations.length = 0;
  role = 'staff';
  const denial = await database.functions.invoke('', { body: { request_id: request.id } });
  assert.equal(denial.error.context.status, 403);
  assert.equal((await denial.error.context.json()).code, 'CALLER_ROLE_NOT_AUTHORIZED');
  assert.deepEqual(operations, []);

  operations.length = 0;
  role = 'admin';
  request.trigger_source = 'test_governed';
  const testTrigger = await database.functions.invoke('', { body: { request_id: request.id } });
  assert.equal((await testTrigger.error.context.json()).code, 'NON_OPERATIONAL_TRIGGER_BLOCKED');
  assert.equal(operations.some((op) => op.providerRequest), false);

  operations.length = 0;
  request.trigger_source = 'staff_admin_operational';
  providerFailure = true;
  await assert.rejects(runCEOOperationsDraft(database, payload), /Groq did not return a readable response/);
  assert.deepEqual(operations.filter((op) => op.name === 'transition_ai_agent_execution').map((op) => op.args.p_status), ['running', 'failed']);
});
