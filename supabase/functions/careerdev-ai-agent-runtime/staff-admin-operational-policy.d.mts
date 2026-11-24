export type StaffAdminOperationalPolicy = {
  operationallyImplemented: boolean;
  ownerRole: "admin" | "staff";
  workflowKey: string;
  inputKeys: string[];
  outputSchema: Record<string, unknown>;
};

export function getStaffAdminOperationalPolicy(agentKey: string): StaffAdminOperationalPolicy | null;
export function evaluateStaffAdminOperationalRequest(args: {
  agent: Record<string, unknown> & { agent_key: string; owner_role: string; status: string; active: boolean; human_approval_required: boolean };
  workflowKey: string;
  workflowActive: boolean;
  callerRole: string;
  triggerSource: string;
  input: unknown;
}): { allowed: boolean; code?: string; policy?: StaffAdminOperationalPolicy };
export function validateStaffAdminOperationalOutput(agentKey: string, output: unknown, input?: unknown): { valid: boolean; code?: string };
