# Production release gates

**Overall: HOLD.** This document is an evidence checklist, not approval. Global TEST billing/refund gates remain disabled. No merge, Supabase modification, paid provider request or production/preview deployment is authorized by passing local checks.

| Gate | Required proof | Current state / blocker |
| --- | --- | --- |
| G01 source/schema provenance | Exact frontend SHA, Edge bundle hashes, full catalog/storage/grant/policy/config export, applied-version mapping, clean-room rebuild and rollback | PARTIAL: frontend/Edge versions/catalog metadata reconciled; 229 vs25 migrations and missing SQL source; full production-shaped export/rebuild open |
| G02 public marketplace | Anonymous approved-only projection; no sensitive fields; real empty vs backend-failure distinction; matching eligibility consistency | FAIL: directory/matching anon grants denied; existing inventory hidden; predicate drift |
| G03 identity/tenancy | Approved synthetic client/coach/staff/admin; signup/verification/recovery/logout/expiry; cross-account/RPC/storage tests | BLOCKED: no approved sessions; broad coach-read policies need intended-scope decision |
| G04 Calendly | Sandbox OAuth/scopes/refresh; booking event compatibility; atomic claims, unknown outcomes, idempotency, timezone, confirmation/cancel/reschedule/webhooks; current meetings | PARTIAL: local PG16 and mocked tests pass; real provider, full schema and role-browser acceptance open |
| G05 financial lifecycle | Paystack TEST exact receipt/owner, duplicates/out-of-order/late events, renewals/expiry/replacement, refunds/disputes, payout reconciliation, credit integrity | PARTIAL: historical one matched TEST/stop; local tests pass; W08/W10/W12/W16 and owner browser/policy cases open. No new financial action approved |
| G06 Career Intelligence | Profile/evidence persistence, cross-user isolation, document formats/errors, selected pilot agents, review gates and service delivery | PARTIAL: substantial code exists; #34/#35/#39 not production integrated or fully accepted |
| G07 provider routing | Confirmed capability/model availability, bounded budgets, safe fallback, provenance, quality, cost/credit telemetry, rollback | HOLD: Gateway/Groq/Exa/Tavily tools dormant; no paid requests. Preserve OpenAI Direct and non-AI fallbacks |
| G08 frontend/dependency security | Exact-commit locked install, typecheck/build/regressions, reviewed dependency findings, compatible headers, mobile/a11y/performance | PARTIAL: local patch/help/skip checks pass; production unchanged; 7 moderate findings, headers and device/performance work open |
| G09 operations/recovery | Intended custom domain, monitoring/alert delivery, support, backups/PITR, timed restore and deployment rollback, incident runbook | BLOCKED: custom domain not in current project domain listing, Brevo reads fail, Sentry delivery and recovery evidence absent |
| G10 explicit release decision | Owner approves exact frontend/backend/schema artifact set and scope after preceding gates | NOT REQUESTED / NOT GRANTED |

## Controlled pilot criteria

A small pilot may use a deliberately reduced feature set, but that scope must be explicit: approved agents, users, services, inference budgets, human-review boundaries, enabled integrations and support owner. Excluded workflows must clearly state availability; do not advertise a paid journey that cannot complete. At minimum G01–G06 must pass for every included path, plus relevant security and recovery checks. A scoped pilot does not waive privacy or payment integrity.

## Release evidence packet

1. Exact candidate Git SHA and lockfile; successful CI for that SHA; preview tested against the recorded isolated backend, not an invalid build-only target.
2. Reviewed migrations with checksums/preconditions and version mapping; no replay of historical SQL; full disposable rehearsal, failure injection and rollback.
3. Edge bundle version/hash and RPC/ACL compatibility table for all changed functions. Include secrets **names/targets only** and configuration attestation, never values.
4. Completed workflow matrix with synthetic identities redacted, expected/actual outcomes, provider TEST modes, duplicate/concurrency/security failures and browser results.
5. Approved pricing/refund/billing-gate policy decisions where applicable. No policy changes inferred from source tests.
6. Monitoring, support, backup/restore and rollback owners/thresholds. Preserve financial/audit history and customer records.
7. Separate explicit authorization for the exact release, followed by controlled rollout and post-release acceptance/observation. Neither merge nor production promotion happens automatically from this audit.

## Rollback boundaries

Frontend rollback must name the verified previous deployment. Backend/schema rollback must be independently compatible and preserve ledger/audit rows; frontend rollback alone does not restore Edge Functions or migrations. Disable newly authorized paths first if needed, reconcile uncertain provider/payment outcomes, and preserve all evidence. Never reset/delete production or the shared AI test environment. Do not treat a hosted Calendly move as automatically recorded in CareerDev without reconciliation.

## Advisor remediation references

- [Callable privileged RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable): review intended exposure and in-function authorization, not blanket revocation.
- [Authenticated privileged RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- [Mutable search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): may intentionally deny direct client access.

No automatic advisor fix, grant, Auth setting, deployment, new key, paid request or remote workflow rerun was executed.
