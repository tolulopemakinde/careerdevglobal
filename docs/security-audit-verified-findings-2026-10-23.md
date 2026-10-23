# Production Security Audit — Verified Findings
**Date:** 2026-10-23  
**Project:** CareerDev Global production Supabase  
**Project ref:** `ufmhrmzumqkjvaezrmxf`  
**Status:** Read-only verification report; no production settings, data, grants, policies, secrets, or deployed functions changed.

## 1. Current security advisor findings

A fresh production Security Advisor read returned:

- **51** `SECURITY DEFINER` functions executable by `authenticated`.
- **16** public-schema tables with RLS enabled but no policies.
- **1** Auth finding: leaked-password protection is disabled.

Advisor references:
- [SECURITY DEFINER function exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

These are review signals, not proof that every function/table is exploitable. Do not bulk-revoke function grants or add broad policies without checking each function's intended caller, internal authorization checks, table privileges, and application dependencies.

## 2. Tables flagged by the advisor

RLS is enabled but no policies are present on:

- `ai_agent_subscription_webhook_events`
- `ai_audit_events`
- `ai_distributed_rate_limits`
- `ai_observability_daily`
- `ai_operational_alerts`
- `ai_output_provenance`
- `ai_output_versions`
- `ai_shared_quota_policies`
- `ai_shared_quota_usage`
- `ai_workflow_revision_executions`
- `calendly_connections`
- `calendly_oauth_states`
- `coach_match_results`
- `coach_matching_preferences`
- `coach_semantic_profiles`
- `email_notification_queue`

**Required review:** determine which tables should be service-role-only, which require user-scoped access, and whether backend functions/jobs depend on privileged access. “No policy” can be intentional for internal tables; validate table grants as well as RLS. Do not add blanket authenticated policies.

## 3. Active Edge Function inventory — JWT verification disabled

The production inventory currently reports `verify_jwt=false` for four active functions:

| Function | Current version | Initial interpretation / next verification |
|---|---:|---|
| `careerdev-coach-matching` | 16 | Public matching endpoint appears intentional. Keep public only if required; verify origin allowlist, distributed rate-limit/quota fail-closed behavior, direct RPC permissions, and response field minimization. |
| `careerdev-paystack-webhook` | 14 | Webhook endpoints commonly bypass JWT; must validate Paystack signature/authenticity, event idempotency, replay handling, and amount/currency/order matching in handler. |
| `careerdev-paystack-payout-webhook` | 8 | Same webhook verification gate; validate payout event signature, idempotency, recipient/amount binding, and state transitions. |
| `careerdev-calendly-oauth` | 10 | OAuth callback may require public access; verify signed/one-time state, redirect URI validation, CSRF protection, and token handling. |

This inventory alone does not prove these endpoints are insecure. Do not enable JWT indiscriminately: doing so could break valid webhooks, OAuth callbacks, or public coach matching. Retrieve and review each active handler before changing settings.

All other functions in the current inventory report `verify_jwt=true`, including `careerdev-ai-agent-runtime` version 24.

## 4. Function review priorities

Review each of the 51 advisor-flagged functions individually, beginning with high-impact functions:

1. Admin mutation/reporting functions (`admin_set_user_role`, `admin_review_coach_application`, payout/booking/profile/service status mutations, admin analytics/details).
2. AI credits and execution governance (`reserve_ai_credits`, `finalize_ai_credit_charge`, `request_ai_agent_execution`, `prepare_ai_agent_execution`, `transition_ai_agent_execution`, `finalize_ai_governed_test_run`, `run_ai_production_safety_gate`).
3. Coach marketplace and profile sync functions.
4. Public-directory and matching functions.

For each function, record: exact signature; owner; fixed `search_path`; grants to `PUBLIC`, `anon`, `authenticated`, and `service_role`; explicit role/ownership checks; dynamic SQL; sensitive data returned; and application call sites. Restrict only after a regression test confirms intended clients continue to work.

Previously inspected definitions indicate that `admin_activate_coach` checks admin/staff role and coach onboarding requirements; `transition_ai_agent_execution` checks an active profile role and request ownership for client/coach callers. The public matching RPCs need separate direct-RPC data-minimization review because Edge Function response filtering does not protect a function invoked directly through PostgREST.

## 5. AI runtime and provider policy

- **OpenAI remains the only planned AI provider.** Do not add Groq or Jina.
- Runtime version 24 is deployed with JWT verification enabled.
- A proposed source patch exists in the working review package but is **not deployed**. Static assertions passed, but it was not compiled with Deno and has not passed integration/security tests.
- Before using that patch, confirm how human-approval requests are created when an execution moves to `awaiting_human_review`; this is not yet established. Also test malformed provider output, credit release/finalization, all status-transition errors, generic client-facing errors, timeout/idempotency, and owner checks.
- Do not deploy the patch until schema parity, Deno compilation, test cases, and rollback are ready.

## 6. Test-environment blocker

The separate Supabase project `yyevuwvtrktrzwuzeddo` is active but currently has no migrations listed and no development branches. It is not yet a representative test environment. Do not run security migrations against production as a substitute for testing. Establish a reproducible schema/migration baseline first; do not copy production personal data into test.

## 7. Release gates

No production deployment or schema/security change until all of the following are true:

- The test project has a verified schema/migration baseline.
- Each policy/function change is narrowly scoped and reviewed against real call sites.
- Automated checks cover cross-user access, anonymous access, role escalation, credit idempotency, human approval, webhook replay, OAuth state replay, and expected public coach matching.
- Edge Function source compiles and passes tests.
- Supabase Security Advisor and end-to-end smoke tests are rerun.
- A rollback path is documented and the owner approves the release.

## 8. Immediate next steps

1. Inspect the three public/webhook/OAuth functions with JWT disabled and confirm their independent request validation.
2. Retrieve exact definitions and grants for the 51 flagged functions; group into admin, AI/credits, public directory, and user-owned operations.
3. Map the 16 RLS/no-policy tables to table grants and intended service access.
4. Build test schema parity and add regression tests before preparing narrowly scoped migrations.
5. Enable leaked-password protection after reviewing the current Auth configuration and rollout impact; record the setting change and verify signup/password-reset behavior.

**No production changes were made by this audit.**


## 9. Follow-up: payout, subscription webhook, and Calendly table controls

A read-only production SQL inspection on 2026-10-23 verified the following:

### Internal table access

- `ai_agent_subscription_webhook_events`, `calendly_connections`, and `calendly_oauth_states` have RLS enabled and **no policies**. Their listed table grants are limited to `postgres` and `service_role`; no `anon` or `authenticated` table grants were returned. This is consistent with backend-only access, but confirm no browser/client code expects direct access.
- `marketplace_payout_transfer_events` has RLS enabled and staff/admin authenticated policies for management and selection. The event table stores webhook payload JSON; confirm those payloads are appropriately minimized and that only staff/admin should read them.
- `marketplace_payouts` grants `SELECT` to authenticated users and has coach-own-payout plus staff/admin policies. No authenticated insert/update/delete grant appeared in the inspected grants. This is a useful boundary to preserve.
- The subscription webhook event table has a unique constraint on `(provider_key, provider_event_reference)`, supporting event-level deduplication.
- Payout transfer events have a partial unique index on `(provider_key, provider_transfer_reference)` when the reference is not null. This prevents repeated event rows for the same provider transfer reference, but it does **not by itself** prove safe handling of distinct/out-of-order event types for the same transfer.

### Payout webhook — highest priority follow-up

The handler review found it inserts a transfer event and, when insert reports a duplicate, still proceeds to update payout status. The database uniqueness constraint limits duplicate rows but does not guarantee safe state transitions. A tested change should make duplicate events a no-op, validate amount/currency against the stored payout and trusted provider payload, and reject or safely ignore stale/conflicting state transitions. Confirm whether Paystack's event schema provides the exact fields needed before implementing comparisons. Replace raw exception detail in client responses with a generic error and safe server-side diagnostic logging. Do not change the live function until replay and transition tests pass.

### Calendly OAuth state

- `calendly_oauth_states.state_hash` is unique, and an expiry index exists.
- Two rows were present at the time of inspection; the count query found both had expired. No state values or verifier contents were retrieved.
- The handler's state lookup, expiry check, and deletion are separate calls. A one-time state can therefore be vulnerable to concurrent callback races unless a separate atomic claim/delete mechanism is present. Review state-creation call sites and implement an atomic consume operation only after confirming schema/caller compatibility.
- `calendly_connections` has a unique constraint on `coach_id`; token ciphertext fields are not granted directly to `authenticated` in the inspected table grants.

### Current data observations

At the inspection time, `ai_agent_subscription_webhook_events` and `marketplace_payout_transfer_events` each contained zero rows. This limits what can be inferred from historical event behavior; it is not evidence that the handlers have been tested. The two expired OAuth-state rows should be handled through an approved, tested cleanup path rather than an ad-hoc production delete.

### Required tests before code or schema changes

1. Replay the same signed payout event twice; confirm the second delivery cannot reapply state.
2. Deliver conflicting and out-of-order success/failure/reversal events; confirm terminal or later states cannot be overwritten incorrectly.
3. Send a validly signed event whose amount/currency or transfer reference does not match the stored payout; confirm no payout mutation occurs.
4. Exercise malformed payloads and internal exceptions; confirm generic client responses and no secret/token/state leakage in logs.
5. Race two OAuth callbacks using the same state; only one may consume it and exchange the code.
6. Confirm client/coach users cannot read webhook payloads, OAuth state rows, or token ciphertext via direct PostgREST access.

**Scope note:** These were read-only catalog, grants, index, policy, and row-count checks. No production data, settings, policies, grants, or deployed functions were changed.
