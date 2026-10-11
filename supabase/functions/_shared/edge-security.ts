export type SecurityErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_INPUT"
  | "FORBIDDEN_ORIGIN"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type CoachMatchingInput = {
  goal: string;
  mode: "Any format" | "Structured" | "Conversational";
  signals: string[];
};

type ResponseOptions = {
  retryAfterSeconds?: number;
  allowMethods?: string[];
  allowHeaders?: string[];
};

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const buckets = new Map<string, { windowStartedAt: number; count: number }>();

export const COACH_MATCHING_MAX_BODY_BYTES = 16 * 1024;
export const COACH_MATCHING_MAX_GOAL_LENGTH = 4000;
export const COACH_MATCHING_MAX_SIGNALS = 10;
export const COACH_MATCHING_WINDOW_MS = 60_000;
export const COACH_MATCHING_REQUESTS_PER_WINDOW = 12;
export const RATE_LIMIT_MAX_BUCKETS = 10_000;

function applyCommonHeaders(headers: Headers, requestId: string, origin?: string, options: ResponseOptions = {}) {
  headers.set("x-request-id", requestId);
  headers.set("Vary", "Origin");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  if (options.retryAfterSeconds !== undefined) headers.set("Retry-After", String(options.retryAfterSeconds));
  if (options.allowMethods) headers.set("Access-Control-Allow-Methods", options.allowMethods.join(", "));
  if (options.allowHeaders) headers.set("Access-Control-Allow-Headers", options.allowHeaders.join(", "));
}

export function securityResponse(
  body: unknown,
  status = 200,
  requestId = crypto.randomUUID(),
  origin?: string,
  options: ResponseOptions = {},
): Response {
  const headers = new Headers(DEFAULT_HEADERS);
  applyCommonHeaders(headers, requestId, origin, options);
  return new Response(JSON.stringify(body), { status, headers });
}

export function preflightResponse(requestId: string, origin?: string): Response {
  const headers = new Headers(DEFAULT_HEADERS);
  applyCommonHeaders(headers, requestId, origin, {
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["authorization", "x-client-info", "apikey", "content-type", "x-request-id"],
  });
  return new Response(null, { status: 204, headers });
}

export function securityError(
  code: SecurityErrorCode,
  status: number,
  requestId: string,
  origin?: string,
  options: ResponseOptions = {},
): Response {
  const messages: Record<SecurityErrorCode, string> = {
    METHOD_NOT_ALLOWED: "Method not allowed.",
    INVALID_JSON: "The request body is not valid JSON.",
    PAYLOAD_TOO_LARGE: "The request is too large.",
    INVALID_INPUT: "Please check the request and try again.",
    FORBIDDEN_ORIGIN: "This origin is not permitted.",
    RATE_LIMITED: "Too many requests. Please wait and try again.",
    INTERNAL_ERROR: "The service is temporarily unavailable.",
  };
  return securityResponse({ error: messages[code], code, request_id: requestId }, status, requestId, origin, options);
}

export function allowedOrigin(request: Request, configuredOrigins: string[] = []): string | undefined {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return undefined;
  return configuredOrigins.includes(origin) ? origin : undefined;
}

export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes = COACH_MATCHING_MAX_BODY_BYTES,
): Promise<{ ok: true; value: T } | { ok: false; code: "INVALID_JSON" | "PAYLOAD_TOO_LARGE" }> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, code: "INVALID_JSON" };
  }
}

export function validateCoachMatchingInput(
  input: unknown,
): { ok: true; value: CoachMatchingInput } | { ok: false } {
  const body = (input ?? {}) as Record<string, unknown>;
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode : "Any format";
  const rawSignals = body.signals;
  if (rawSignals !== undefined && (!Array.isArray(rawSignals) || rawSignals.some((signal) => typeof signal !== "string" || !signal.trim()))) {
    return { ok: false };
  }
  const signals = (rawSignals as string[] | undefined)?.map((signal) => signal.trim()) ?? [];
  if (signals.length > COACH_MATCHING_MAX_SIGNALS || goal.length < 1 || goal.length > COACH_MATCHING_MAX_GOAL_LENGTH || !["Any format", "Structured", "Conversational"].includes(mode)) {
    return { ok: false };
  }
  return { ok: true, value: { goal, mode: mode as CoachMatchingInput["mode"], signals } };
}

/** Pass a client key only when it came from trusted platform infrastructure or verified auth. */
export function requestKey(_request: Request, authenticatedUserId?: string, trustedClientKey?: string): string {
  if (authenticatedUserId) return `user:${authenticatedUserId}`;
  return `anonymous:${trustedClientKey || "shared-fallback"}`;
}

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt >= COACH_MATCHING_WINDOW_MS) buckets.delete(key);
  }
  while (buckets.size >= RATE_LIMIT_MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

/** Instance-local emergency budget; use a shared limiter for distributed production enforcement. */
export function consumeRateLimit(
  key: string,
  now = Date.now(),
  windowMs = COACH_MATCHING_WINDOW_MS,
  maxRequests = COACH_MATCHING_REQUESTS_PER_WINDOW,
): { allowed: boolean; retryAfterSeconds: number } {
  pruneBuckets(now);
  const current = buckets.get(key);
  if (!current || now - current.windowStartedAt >= windowMs) {
    buckets.set(key, { windowStartedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= maxRequests) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - current.windowStartedAt)) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function diagnosticRecord(requestId: string, error: unknown): { request_id: string; internal_error: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const sanitized = raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|secret|signature|token|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL_REDACTED]")
    .slice(0, 512);
  return { request_id: requestId, internal_error: sanitized };
}
