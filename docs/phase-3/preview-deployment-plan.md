# Phase 3 Preview Deployment and Verification Plan

This plan is intentionally **production-blocked**. It does not create a Supabase project, users, secrets, or provider calls.

## Required preview boundary

- Separate Supabase project ref, verified not to be production `ufmhrmzumqkjvaezrmxf`.
- Synthetic users, coaches, quota policies, and documents only.
- Test-only or disabled external providers.
- Edge Function environment variables configured only in preview:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DISTRIBUTED_RATE_LIMIT_ENABLED=true`
  - `ALLOWED_ORIGINS` set to the preview URL only
- No production database URL, service-role key, Paystack secret, OAuth secret, or OpenAI production credential.

## Controls to verify

1. Atomic concurrent calls to `consume_distributed_rate_limit` stop at the configured limit across multiple function instances.
2. Expired windows reset and return a bounded `retry_after_seconds` value.
3. Shared quota counters stop at request and credit limits without lost updates.
4. The functions cannot be executed by `anon` or `authenticated` roles.
5. Duplicate requests with the same application idempotency key do not double-charge credits.
6. Existing `reserve_ai_credits` and `finalize_ai_credit_charge` remain authoritative for customer entitlements.
7. Malformed JSON, oversized payloads, invalid origins, invalid signals, and provider failures return stable redacted responses.
8. No public response contains service-role material, provider error text, private coach fields, or raw database errors.
9. Human-review-required AI states remain enforced by the existing state-machine functions.
10. The production-blocked authorization manifest passes with synthetic identities and data.

## Stop conditions

Stop immediately on cross-user access, quota overshoot, double charge, raw error disclosure, public execution of a service-only RPC, missing audit/correlation data, or any request that reaches the production project.

## Rollback

Before any production approval, record the exact migration hash, handler commit, environment-variable diff, deployment ID, and database backup/rollback approach. Remove the endpoint wiring first, then disable the policies, and only then consider cleanup. Do not delete production data as part of rollback.
