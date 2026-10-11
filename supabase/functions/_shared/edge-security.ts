export type SecurityErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type CoachMatchingInput = {
  goal: string;
  mode: "Any format" | "Structured" | "Conversational";
  signals: string[];
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

export function securityResponse(
  body: unknown,
  status = 200,
  requestId = crypto.randomUUID(),
  origin?: string,
): Response {
  const headers = new Headers(DEFAULT_HEADERS);
  headers.set("x-request-id", requestId);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  return new Response(JSON.stringify(body), { status, headers });
}

export function securityError(
  code: SecurityErrorCode,
  status: number,
  requestId: string,
  origin?: string,
): Response {
  const messages: Record<SecurityErrorCode, string> = {
    METHOD_NOT_ALLOWED: "Method not allowed.",
    INVALID_JSON: "The request body is not valid JSON.",
    PAYLOAD_TOO_LARGE: "The request is too large.",
    INVALID_INPUT: "Please check the request and try again.",
    RATE_LIMITED: "Too many requests. Please wait and try again.",
    INTERNAL_ERROR: "The service is temporarily unavailable.",
  };
  return securityResponse(
    { error: messages[code], code, request_id: requestId },
    status,
    requestId,
    origin,
  );
}

export function allowedOrigin(
  request: Request,
  configuredOrigins: string[] = [],
): string | undefined {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return undefined;
  return configuredOrigins.includes(origin) ? origin : undefined;
}

export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes = COACH_MATCHING_MAX_BODY_BYTES,
): Promise<{ ok: true; value: T } | { ok: false; code: "INVALID_JSON" | "PAYLOAD_TOO_LARGE" }> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  }
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
  const signals = Array.isArray(body.signals)
    ? body.signals.filter((signal): signal is string => typeof signal === "string").slice(0, COACH_MATCHING_MAX_SIGNALS)
    : [];
  if (
    goal.length < 1 ||
    goal.length > COACH_MATCHING_MAX_GOAL_LENGTH ||
    !["Any format", "Structured", "Conversational"].includes(mode)
  ) {
    return { ok: false };
  }
  return { ok: true, value: { goal, mode: mode as CoachMatchingInput["mode"], signals } };
}

export function requestKey(request: Request, authenticatedUserId?: string): string {
  if (authenticatedUserId) return `user:${authenticatedUserId}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const connecting = request.headers.get("cf-connecting-ip")?.trim();
  return `anonymous:${connecting || forwarded || "unknown"}`;
}

/**
 * Instance-local emergency budget. Production should replace this with a
 * shared limiter before relying on it for abuse prevention across isolates.
 */
export function consumeRateLimit(
  key: string,
  now = Date.now(),
  windowMs = COACH_MATCHING_WINDOW_MS,
  maxRequests = COACH_MATCHING_REQUESTS_PER_WINDOW,
): { allowed: boolean; retryAfterSeconds: number } {
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
  return { request_id: requestId, internal_error: error instanceof Error ? error.message : String(error) };
}
