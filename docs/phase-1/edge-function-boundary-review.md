# Edge Function Boundary Review — Phase 1

**Inspection date:** 11 October 2026 (WAT)  
**Mode:** Read-only inspection of deployed metadata and source. No Edge Function was deployed or modified.

## Boundary inventory

| Function | Version | JWT verification | Intended boundary | Current observation |
|---|---:|---:|---|---|
| `careerdev-coach-matching` | 13 | Disabled | Public coach discovery | Public input is bounded and output is projected, but no visible rate limit or abuse budget exists |
| `careerdev-ai-agent-runtime` | 23 | Enabled | Authenticated AI execution | Authenticates users and checks roles/subscriptions, but the direct persistence path can override human-review state |
| `careerdev-paystack-webhook` | 13 | Disabled | Paystack server-to-server webhook | Correctly uses signature validation instead of Supabase JWT; event hashing and duplicate detection are present |

## Positive controls observed

### Coach matching

The function:

- accepts only POST;
- limits goals to 4,000 characters;
- limits signals to 10 string values;
- validates coaching mode against an allowlist;
- calls public-coach RPCs with bounded limits;
- projects returned coach objects to an explicit public-field shape;
- uses a deterministic fallback ranking when vector results are empty.

### AI runtime

The function:

- requires a bearer token and calls `auth.getUser()`;
- requires an active profile with an allowed role;
- checks request existence, runnable status, ownership for coaches, and prepared execution state;
- checks governed-test caller roles;
- checks active agent and subscription access;
- reserves credits with an idempotency key;
- uses configuration snapshots for prompt/model selection;
- records usage and releases credits on provider failure;
- uses source-aware web search for current external information;
- routes governed test executions to human review;
- checks quality for service workflow executions.

### Paystack webhook

The function:

- requires POST;
- requires configured credentials;
- validates `x-paystack-signature` using HMAC-SHA512 over the raw body;
- rejects missing/invalid signatures before parsing;
- hashes payloads;
- detects duplicate event references;
- persists verified events before applying state;
- routes payment state through a database function;
- handles AI subscription webhook events separately from marketplace payment events.

## Findings requiring remediation design

### E1 — Human-review state can be overwritten in the direct runtime path

In the direct non-service path, after producing output the runtime uses the service-role client to update `ai_agent_executions` with:

- `status = 'completed'`
- `human_review_required = false`
- `human_review_status = 'not_required'`

It then calls `transition_ai_agent_execution` with `completed`. The transition function correctly blocks completion when the execution record says human review is required, but the runtime has already overwritten that flag. This creates a policy-enforcement gap: the registry/configuration-derived approval requirement is not preserved as an invariant at persistence time.

**Required safe design:** the runtime must never downgrade `human_review_required` from the prepared execution. Completion should be accepted only when the stored execution’s review requirement is satisfied, and the database transition should remain authoritative. This is a proposed code/database change, not performed here.

### E2 — Public coach matching has no visible abuse budget

JWT verification is disabled by design for public discovery. The source bounds individual inputs, but the function performs embedding inference and can invoke multiple vector operations or fallback embedding calculations per request. No visible per-IP, per-user, concurrency, daily quota, or circuit-breaker control exists in the inspected source.

**Required safe design:** add an abuse-control layer outside or around the function with a defined policy for anonymous traffic, including request rate, maximum concurrent work, timeout, fallback limit, and monitoring. The policy must not rely on a client-supplied header or the publishable key as identity.

### E3 — Public error responses expose internal detail

The coach-matching function returns database error messages in `detail` fields and returns `String(err)` from its catch block. The AI runtime also returns selected provider/database error details. These messages can expose internal table, RPC, provider, or configuration information.

**Required safe design:** log detailed diagnostics to protected observability, return stable public error codes/messages, and attach a correlation ID for support. Do not return SQL/provider details to anonymous or ordinary client callers.

### E4 — Wildcard CORS is broad

Coach matching and the AI runtime use `Access-Control-Allow-Origin: *`. This is compatible with a public browser endpoint, but authenticated runtime responses should use an explicit origin policy where practical. CORS is not authorization; the bearer-token and role checks must remain mandatory.

### E5 — AI runtime service-role write path requires server-side invariants

The runtime uses the service-role client for execution-output and usage writes. That is appropriate for trusted server orchestration only if the function preserves immutable fields and validates transitions before every privileged write. A service-role update must not be able to bypass human-review, quality, ownership, credit, or provenance invariants.

### E6 — Webhook payload retention requires data-minimization review

The Paystack webhook persists full payloads in webhook-event tables. This supports reconciliation and audit, but payload retention, access, masking, and retention periods should be documented. The webhook should not expose payloads in responses or logs, and downstream admin views should return only the minimum fields required.

## Safe implementation contract

Before any production function change is authorized:

1. Add a synthetic test proving an agent configured for human review cannot be completed by the direct runtime path.
2. Add a synthetic test proving an agent configured as no-review can still not bypass other quality/provenance gates.
3. Add public matching tests for input bounds, response field allowlisting, repeated-request throttling, timeout, and stable error redaction.
4. Add webhook tests for missing signature, invalid signature, duplicate event, malformed JSON, unmatched subscription, and replayed event.
5. Add a protected correlation ID to logs and public error responses.
6. Define retention and access policy for stored webhook payloads.
7. Execute these tests only against an isolated preview project.

## Current disposition

No remediation was applied. The deployed source should be treated as the current production behavior until a reviewed change is approved and tested in isolation.
