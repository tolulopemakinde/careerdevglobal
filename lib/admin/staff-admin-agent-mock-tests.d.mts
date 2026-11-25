export type StaffAdminAgentMockResult = {
  status: 'passed' | 'blocked';
  mode: 'mocked_zero_cost';
  test_run_at?: string;
  agent?: string;
  agent_key?: string;
  workflow_key?: string;
  checks: Array<{ name: string; status: 'passed' | 'blocked'; detail?: string }>;
  stages?: Array<{ name: string; status: 'passed' | 'blocked' | 'simulated' | 'not_run' | 'pending' }>;
  synthetic_input?: Record<string, unknown>;
  mock_result?: Record<string, unknown>;
  execution?: {
    authorization: 'passed' | 'blocked';
    preparation: 'simulated' | 'not_run';
    provider: 'mock_fixture';
    provider_calls: 0;
    network_calls: 0;
    model_tokens: 0;
    estimated_cost_usd: 0;
    persisted: false;
  };
  human_review?: { required: true; status: 'pending'; human_approved: false };
  activation?: { status: string; active: boolean; operational_use: 'blocked' };
  message: string;
};

export const STAFF_ADMIN_AGENT_MOCK_CASES: Readonly<Record<string, unknown>>;
export function runStaffAdminAgentMockTest(options: {
  agent: Record<string, unknown> & { agent_key: string; status: string; active: boolean; human_approval_required: boolean };
  actorRole: string;
  actorStatus?: string;
  now?: () => string;
}): StaffAdminAgentMockResult;
