# Phase 4 Operational Readiness Checklist

Use this checklist only after an isolated preview project exists. Checkboxes are evidence requirements, not authorization to execute them.

## Preview isolation

- [ ] Preview Supabase ref is recorded and differs from production.
- [ ] Synthetic users/data only.
- [ ] No production secrets or provider credentials are present.
- [ ] External paid providers are disabled or test-only.
- [ ] `ALLOWED_ORIGINS` contains preview origins only.
- [ ] `DISTRIBUTED_RATE_LIMIT_ENABLED=true` is set only in preview.

## Distributed controls

- [ ] Preview SQL checksum recorded.
- [ ] New quota tables have RLS enabled.
- [ ] `anon` and `authenticated` direct table access is denied.
- [ ] Service-only RPC execution is denied to `anon` and `authenticated`.
- [ ] Concurrent limiter test shows no overshoot.
- [ ] Concurrent shared quota test shows no overshoot.
- [ ] Window expiry and retry responses are verified.
- [ ] Missing limiter/RPC configuration fails closed.

## AI governance and entitlements

- [ ] Existing credit reservation remains idempotent.
- [ ] Failed AI calls release reservations.
- [ ] Human-review-required states cannot be bypassed.
- [ ] Prompt/model/provenance snapshots remain intact.
- [ ] Public responses exclude private coach fields and provider diagnostics.

## Observability

- [ ] Every request has a correlation ID.
- [ ] Rate-limit/quota denials produce protected structured events.
- [ ] Diagnostics are sanitized and truncated.
- [ ] Alerts exist for quota exhaustion, RPC failures, unexpected 5xx, and repeated origin rejection.
- [ ] Logs contain no service-role key, bearer token, raw email, payment secret, or full document content.

## Rollback

- [ ] Disable endpoint wiring first.
- [ ] Restore prior Edge Function version.
- [ ] Disable quota policy before cleanup.
- [ ] Preserve audit evidence.
- [ ] Do not delete production data as a rollback step.
