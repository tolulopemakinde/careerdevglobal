export function sendStaffAdminGroqRequest(options: {
  apiKey: string;
  body: { model: string; [key: string]: unknown };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<Response>;
