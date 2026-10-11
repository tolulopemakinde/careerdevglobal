# Phase 2 — Server-Side Edge Function Hardening

**Status:** Preview-ready adapter implemented; deployed functions not modified.  
**Branch:** `phase-2-server-hardening`

## Implemented adapter

`supabase/functions/_shared/edge-security.ts` provides Deno-compatible primitives for the reviewed Edge Function boundaries:

- Request-body byte limits before JSON parsing.
- Stable method, JSON, payload, validation, rate-limit, and internal-error responses.
- Request correlation IDs through `x-request-id`.
- Explicit-origin CORS helper with `Vary: Origin`.
- Coach-matching goal, mode, and signal validation.
- Anonymous/user request-key derivation.
- An instance-local emergency request budget.
- Diagnostic records from `diagnosticRecord` that can be sent to protected logs without returning raw details to callers.

The adapter deliberately does not contain Supabase credentials, provider calls, database writes, or production project identifiers.

## Required function wiring

### Coach matching

At the start of the handler, before model inference or database RPCs:

1. Reject non-POST requests with `securityError("METHOD_NOT_ALLOWED", 405, requestId, origin)`.
2. Parse with `readJsonWithLimit(request)`.
3. Validate with `validateCoachMatchingInput`.
4. Consume a request budget with `consumeRateLimit(requestKey(request))`.
5. Return `429` with `Retry-After` when the budget is exhausted.
6. Return only the allowlisted public coach projection.
7. In `catch`, log `diagnosticRecord(requestId, error)` to protected observability and return `securityError("INTERNAL_ERROR", 500, requestId, origin).

The in-memory limiter is an emergency per-isolate budget only. A shared limiter or database-backed quota is required before claiming distributed abuse prevention in production.

### AI runtime

Use the same stable-error and correlation-ID behavior, but do not use the public anonymous rate policy as the primary control. Authenticated runtime requests should be keyed by verified user ID and subject to subscription/credit controls already enforced by the runtime.

Most importantly, preserve `human_review_required` from the prepared execution. The runtime must not update it to `false` during output persistence. The guarded database transition remains authoritative for completion.

### Paystack webhook

Keep webhook signature verification over the raw body before JSON parsing. Apply the body limit and stable errors, but do not use browser CORS or anonymous rate logic as a substitute for provider signature verification. Preserve duplicate-event handling and correlation IDs.

## Server-side validation requirements

Client limits are advisory. The Edge Function must enforce them again:

| Input | Required rule |
|---|---|
| HTTP method | POST only |
| JSON body | Maximum 16 KiB for coach matching |
| Goal | 1–4,000 trimmed characters |
| Signals | String values only; maximum 10 |
| Mode | `Any format`, `Structured`, or `Conversational` |
| Result limit | Server-fixed; never trust a client limit |
| Error detail | Never return SQL/provider/stack details |

## Not performed

The deployed Edge Functions are not tracked in the application repository, and the connected Supabase account has no separate preview project. Therefore this tranche does not claim to have changed live server behavior. No Edge Function deployment, Supabase migration, grant/RLS change, or production data operation was performed.

Before wiring and deploying, create or identify an isolated preview project, copy only reviewed source, configure test-only secrets/providers, execute the Phase 2 synthetic cases, and obtain owner review of the exact deployment diff.
