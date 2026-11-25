import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import {
  buildStructuredResult, isStructuredAgent, structuredClientCoachAgents, supportsGuidedWorksheet, validateStructuredRequest,
} from '../supabase/functions/careerdev-ai-agent-runtime/client-coach-structured.ts';

const answers = { target: 'Operations analyst', required: 'SQL\nProcess mapping\nSQL', supported: 'sql' };

test('each approved worksheet returns a grounded, human-review-aware workflow result', () => {
  assert.equal(Object.keys(structuredClientCoachAgents).length, 9);
  for (const [key, agent] of Object.entries(structuredClientCoachAgents)) {
    const fixture = Object.fromEntries(agent.fields.map(({ key }) => [key, `Synthetic ${key}`]));
    const input = validateStructuredRequest(key, fixture);
    const output = buildStructuredResult(key, input, true);
    assert.equal(output.generated_by_ai, false);
    assert.equal(output.human_review_required, true);
    assert.ok(output.result.title);
    assert.ok(output.result.findings.some(finding => finding.toLowerCase().includes('synthetic')));
    assert.equal(output.result.next_steps.length, 2);
    assert.equal(output.source_refs[0].type, 'user_input');
    assert.ok(output.uncertainty_flags.length);
  }
  assert.equal(isStructuredAgent('cv_resume_agent'), false);
  assert.equal(isStructuredAgent('constructor'), false);
  assert.equal(supportsGuidedWorksheet('ai_required'), false);
  assert.equal(validateStructuredRequest('skills_gaps_agent', { ...answers, output_schema: {} }), null);
  assert.equal(validateStructuredRequest('skills_gaps_agent', { ...answers, target: ' ' }), null);
  assert.deepEqual(
    buildStructuredResult('skills_gaps_agent', answers, false).result.findings,
    ['Target: Operations analyst', 'Skills you listed evidence for: sql', 'Skills with evidence still to check: process mapping'],
  );
});

test('guided runtime keeps the result in the existing execution, with no credits or external inference', async (t) => {
  const stages = [];
  let handler;
  let status = 'testing';
  let role = 'staff';
  let requestedBy = 'synthetic-user';
  let denyAccess = false;
  let persistFailure = false;
  const key = 'skills_gaps_agent';
  const current = {
    ai_agent_executions: { id: 'execution-1', agent_id: 'agent-1', workflow_id: 'workflow-1', human_review_required: false },
    ai_agent_workflows: { workflow_key: `${key}_session`, active: true },
  };

  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
    from(table) {
      const record = {
        ...current,
        ai_agent_execution_requests: { id: 'request-1', execution_id: 'execution-1', status: 'prepared', requested_by: requestedBy, trigger_source: 'client_coach_structured_workspace', input_payload: { request: answers } },
        ai_agent_registry: { id: 'agent-1', agent_key: key, owner_role: 'client_coach', status, active: true, ai_dependency_mode: 'works_without_ai' },
        profiles: { role, status: 'active' },
      }[table];
      const query = { eq: () => query, maybeSingle: async () => ({ data: record }) };
      return {
        select: () => query,
        update: (values) => {
          stages.push({ table, values });
          const update = { eq: () => update, select: () => update, maybeSingle: async () => ({ data: persistFailure ? null : { id: 'execution-1' } }) };
          return update;
        },
      };
    },
    async rpc(name, args) {
      if (name === 'get_my_ai_agent_access') return { data: [{ allowed: !denyAccess }] };
      assert.equal(name, 'transition_ai_agent_execution', 'a guided worksheet must not reserve credits');
      stages.push(args.p_status);
      return { data: true };
    },
  };
  const entry = new URL('../supabase/functions/careerdev-ai-agent-runtime/index.ts', import.meta.url).href;
  const mockDependency = 'data:text/javascript,export const createClient = globalThis.guidedTestClient;';
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL !== entry) return next(specifier, context);
      if (specifier === 'edge-runtime') return { url: 'data:text/javascript,export {}', shortCircuit: true };
      if (specifier === '@supabase/supabase-js') return { url: mockDependency, shortCircuit: true };
      return next(specifier, context);
    },
  });
  const defaultFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Guided worksheets must not make provider requests'); };
  globalThis.guidedTestClient = () => db;
  globalThis.Deno = {
    env: { get: name => name.startsWith('SUPABASE_') ? 'synthetic' : undefined },
    serve: callback => { handler = callback; },
  };
  t.after(() => {
    hooks.deregister();
    delete globalThis.guidedTestClient;
    delete globalThis.Deno;
    globalThis.fetch = defaultFetch;
  });
  await import(entry);
  const invoke = () => handler(new Request('https://edge.example.test', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ request_id: 'request-1' }),
  }));
  const response = await invoke();
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, 'completed');
  assert.equal(result.execution_id, 'execution-1');
  assert.equal(result.output.generated_by_ai, false);
  assert.deepEqual(stages, [
    'running',
    { table: 'ai_agent_executions', values: {
      output_snapshot: result.output,
      quality_summary: { mode: 'guided_worksheet', generated_by_ai: false },
      updated_at: stages[1].values.updated_at,
    } },
    'completed',
  ]);

  stages.length = 0;
  role = 'client';
  assert.equal((await invoke()).status, 403);
  status = 'live';
  denyAccess = true;
  assert.equal((await invoke()).status, 403);
  denyAccess = false;
  requestedBy = 'another-account';
  assert.equal((await invoke()).status, 403);
  assert.deepEqual(stages, []);
  requestedBy = 'synthetic-user';
  persistFailure = true;
  assert.equal((await invoke()).status, 500);
  assert.equal(stages.at(-1), 'failed');
});
