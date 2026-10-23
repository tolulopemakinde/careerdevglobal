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
