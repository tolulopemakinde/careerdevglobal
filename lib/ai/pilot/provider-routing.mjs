/**
 * Development-only provider routing policy for synthetic career cases.
 * This file does NOT authorize a client request, reserve/finalize AI credits,
 * or expose a Next.js endpoint. Do not wire it into live agents as-is.
 * No provider credentials or production prompts belong here.
 */
export const SYNTHETIC_AGENT_ID = "career-discovery-synthetic";

export class PilotPolicyError extends Error {
  constructor(code) {
    super(code);
    this.name = "PilotPolicyError";
    this.code = code;
  }
}

export class PilotProviderError extends Error {
  constructor() {
    super("PILOT_PROVIDER_FAILED");
    this.name = "PilotProviderError";
  }
}

const TRANSIENT_STATUSES = new Set([408, 500, 502, 503, 504]);
const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"]);
const RATE_LIMIT_CODES = new Set(["rate_limit_exceeded", "rate_limit_error", "rate_limit"]);
const PERMANENT_QUOTA_CODES = new Set([
  "insufficient_quota", "credit_balance_exhausted",
  "organization_spend_limit_exceeded", "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded", "billing_hard_limit_reached",
]);

function providerErrorCode(error) {
  const sources = [error?.error?.code, error?.data?.error?.code,
    error?.response?.data?.error?.code, error?.code];
  if (typeof error?.responseBody === "string" && error.responseBody.length <= 4096) {
    try {
      const payload = JSON.parse(error.responseBody);
      sources.unshift(payload?.error?.code);
    } catch { /* Non-JSON provider failure; do not log raw response. */ }
  }
  return sources.find(code => typeof code === "string")?.toLowerCase() || "";
}

export function isTransientProviderError(error) {
  if (!error || typeof error !== "object") return false;
  // A user/application cancellation must never trigger another billable call.
  if (error.name === "AbortError") return false;
  const code = providerErrorCode(error);
  // HTTP 429 may mean an exhausted account, not a temporary throughput limit.
  if (PERMANENT_QUOTA_CODES.has(code)) return false;
  const status = Number(error.status ?? error.statusCode);
  if (status === 429) {
    const headers = error.headers ?? error.responseHeaders;
    const retryAfter = typeof headers?.get === "function"
      ? headers.get("retry-after")
      : headers?.["retry-after"] ?? headers?.["Retry-After"];
    return RATE_LIMIT_CODES.has(code) || (typeof retryAfter === "string" && retryAfter.trim() !== "");
  }
  if (TRANSIENT_STATUSES.has(status)) return true;
  if (error.name === "TimeoutError") return true;
  return TRANSIENT_CODES.has(error.code);
}

function checkModel(model, expectedProvider) {
  return model &&
    model.provider === expectedProvider &&
    typeof model.modelId === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9/_:.-]{2,119}$/.test(model.modelId);
}

/**
 * @param {{
 *   enabled: boolean,
 *   requestId: string,
 *   agentId: string,
 *   synthetic: boolean,
 *   prompt: string,
 *   primary: {provider: 'openai', modelId: string},
 *   fallback?: {provider: 'groq', modelId: string},
 *   fallbackEnabled?: boolean,
 *   invoke: (request: {provider: string, modelId: string, prompt: string, requestId: string}) => Promise<{text: string, usage?: unknown}>,
 *   record?: (event: {requestId: string, agentId: string, provider: string, modelId: string, outcome: string, durationMs: number, attempt: number}) => Promise<void>
 * }} opts
 */
export async function runSyntheticProviderPilot(opts) {
  if (!opts || opts.enabled !== true) throw new PilotPolicyError("PILOT_DISABLED");
  if (opts.agentId !== SYNTHETIC_AGENT_ID || opts.synthetic !== true) {
    throw new PilotPolicyError("SYNTHETIC_ONLY");
  }
  if (typeof opts.prompt !== "string" || opts.prompt.length < 1 || opts.prompt.length > 2000) {
    throw new PilotPolicyError("INVALID_PROMPT_SIZE");
  }
  if (typeof opts.requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(opts.requestId)) {
    throw new PilotPolicyError("INVALID_REQUEST_ID");
  }
  if (!checkModel(opts.primary, "openai") ||
      (opts.fallback && !checkModel(opts.fallback, "groq"))) {
    throw new PilotPolicyError("UNAPPROVED_PROVIDER_MODEL");
  }
  if (typeof opts.invoke !== "function") throw new PilotPolicyError("MISSING_PROVIDER_EXECUTOR");
  if (opts.record !== undefined && typeof opts.record !== "function") {
    throw new PilotPolicyError("INVALID_METRICS_WRITER");
  }

  const models = [opts.primary];
  if (opts.fallbackEnabled === true && opts.fallback) models.push(opts.fallback);

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    const started = Date.now();
    let result;
    try {
      result = await opts.invoke({
        provider: model.provider, modelId: model.modelId,
        prompt: opts.prompt, requestId: opts.requestId,
      });
    } catch (error) {
      const transient = isTransientProviderError(error);
      // No prompts, responses, exception bodies, or user identifiers in metrics.
      if (opts.record) {
        await opts.record({
          requestId: opts.requestId, agentId: opts.agentId,
          provider: model.provider, modelId: model.modelId,
          outcome: transient ? "transient_failure" : "permanent_failure",
          durationMs: Date.now() - started, attempt: index + 1,
        });
      }
      if (!transient || index === models.length - 1) throw new PilotProviderError();
      continue;
    }
    // Invalid/empty output is not proof of a transient outage. Do not fallback
    // to an unreviewed model when structured-content validation may have failed.
    if (!result || typeof result.text !== "string" ||
        result.text.trim().length === 0 || result.text.length > 6000) {
      throw new PilotPolicyError("INVALID_PROVIDER_OUTPUT");
    }
    if (opts.record) {
      await opts.record({
        requestId: opts.requestId, agentId: opts.agentId,
        provider: model.provider, modelId: model.modelId,
        outcome: "success", durationMs: Date.now() - started,
        attempt: index + 1,
      });
    }
    return {
      requestId: opts.requestId, agentId: opts.agentId,
      provider: model.provider, modelId: model.modelId,
      text: result.text, usage: result.usage ?? null, attempts: index + 1,
    };
  }
  throw new PilotProviderError();
}
