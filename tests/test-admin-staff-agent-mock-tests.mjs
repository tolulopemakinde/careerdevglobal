import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STAFF_ADMIN_AGENT_MOCK_CASES, runStaffAdminAgentMockTest } from '../lib/admin/staff-admin-agent-mock-tests.mjs';

const agentKeys = [
  'ceo_operations_ai',
  'career_discovery_ai',
  'cv_linkedin_ai',
  'lead_generation_ai',
  'marketing_content_ai',
  'research_opportunities_ai',
  'sales_proposal_ai',
];

function registryAgent(agentKey, overrides = {}) {
  return {
    agent_key: agentKey,
    owner_role: agentKey === 'ceo_operations_ai' ? 'admin' : 'staff',
    workflow_key: STAFF_ADMIN_AGENT_MOCK_CASES[agentKey]?.workflow,
    status: 'testing',
    active: false,
    human_approval_required: true,
    ...overrides,
  };
}

test('the seven fixed synthetic workflows pass with role-specific access and no provider or network calls', () => {
  assert.deepEqual(Object.keys(STAFF_ADMIN_AGENT_MOCK_CASES).sort(), [...agentKeys].sort());

  for (const agentKey of agentKeys) {
    const actorRole = agentKey === 'ceo_operations_ai' ? 'admin' : 'staff';
    const result = runStaffAdminAgentMockTest({
      agent: registryAgent(agentKey),
      actorRole,
      now: () => '2026-11-24T00:00:00.000Z',
    });

    assert.equal(result.status, 'passed', agentKey);
    assert.equal(result.workflow_key, STAFF_ADMIN_AGENT_MOCK_CASES[agentKey].workflow);
    assert.equal(result.execution.provider_calls, 0);
    assert.equal(result.execution.network_calls, 0);
    assert.equal(result.execution.model_tokens, 0);
    assert.equal(result.execution.estimated_cost_usd, 0);
    assert.equal(result.execution.persisted, false);
    assert.equal(result.human_review.required, true);
    assert.equal(result.human_review.status, 'pending');
    assert.equal(result.human_review.human_approved, false);
    assert.equal(result.activation.status, 'testing');
    assert.equal(result.activation.active, false);
    assert.equal(result.activation.operational_use, 'blocked');
    assert.ok(result.checks.every((check) => check.status === 'passed'));
  }
});

test('the Admin-owned CEO agent cannot be tested by Staff', () => {
  const result = runStaffAdminAgentMockTest({ agent: registryAgent('ceo_operations_ai'), actorRole: 'staff' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((check) => check.name === 'role_authorization').status, 'blocked');
});

test('Client, Coach, and inactive Staff sessions are denied', () => {
  for (const [actorRole, actorStatus] of [['client', 'active'], ['coach', 'active'], ['staff', 'suspended']]) {
    const result = runStaffAdminAgentMockTest({ agent: registryAgent('cv_linkedin_ai'), actorRole, actorStatus });
    assert.equal(result.status, 'blocked');
    assert.equal(result.checks.find((check) => check.name === 'role_authorization').status, 'blocked');
  }
});

test('a testing agent with operational access enabled is blocked', () => {
  const result = runStaffAdminAgentMockTest({ agent: registryAgent('lead_generation_ai', { active: true }), actorRole: 'staff' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.checks.find((check) => check.name === 'testing_only').status, 'blocked');
});

test('missing human-review enforcement or a mismatched workflow blocks the test', () => {
  const noReview = runStaffAdminAgentMockTest({ agent: registryAgent('marketing_content_ai', { human_approval_required: false }), actorRole: 'staff' });
  assert.equal(noReview.status, 'blocked');
  assert.equal(noReview.checks.find((check) => check.name === 'human_review_gate').status, 'blocked');

  const wrongWorkflow = runStaffAdminAgentMockTest({ agent: registryAgent('research_opportunities_ai', { workflow_key: 'opportunity_matching' }), actorRole: 'staff' });
  assert.equal(wrongWorkflow.status, 'blocked');
  assert.equal(wrongWorkflow.checks.find((check) => check.name === 'workflow_contract').status, 'blocked');

  const wrongOwner = runStaffAdminAgentMockTest({ agent: registryAgent('ceo_operations_ai', { owner_role: 'staff' }), actorRole: 'admin' });
  assert.equal(wrongOwner.status, 'blocked');
  assert.equal(wrongOwner.checks.find((check) => check.name === 'owner_role_contract').status, 'blocked');
});

test('agents outside the fixed Staff/Admin scope are denied', () => {
  const result = runStaffAdminAgentMockTest({ agent: registryAgent('interview_coach_agent'), actorRole: 'admin' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.mode, 'mocked_zero_cost');
});

test('both Admin test handlers stay local and cannot call Supabase or a runtime endpoint', async () => {
  const source = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  const careerDiscoveryStart = source.indexOf('async function runCareerDiscoveryMockTest()');
  const staffAdminStart = source.indexOf('async function runStaffAdminAgentTest(agentKey:string)');
  const nextHandlerStart = source.indexOf('async function runClientCoachQualitySuite()', staffAdminStart);
  assert.ok(careerDiscoveryStart >= 0 && staffAdminStart > careerDiscoveryStart && nextHandlerStart > staffAdminStart);

  for (const handler of [source.slice(careerDiscoveryStart, staffAdminStart), source.slice(staffAdminStart, nextHandlerStart)]) {
    assert.doesNotMatch(handler, /supabase\.(rpc|from|functions)\s*\(/);
    assert.doesNotMatch(handler, /\bfetch\s*\(/);
    assert.doesNotMatch(handler, /getSession\s*\(/);
  }
});
