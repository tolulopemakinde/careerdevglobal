# Phase 3 — Comprehensive Security and AI-Infrastructure Audit

**Audit date:** 2026-10-11 (WAT)  
**Status:** Read-only audit completed; preview-only implementation in progress  
**Production changes:** None

## Confirmed resources and access

| Component | Verified resource | Access observed |
|---|---|---|
| GitHub | `tolulopemakinde/careerdevglobal` | Read/write repository branch and PR access through `gh`; no production deployment performed |
| Vercel | Project `careerdevglobal`, project id `prj_jBsWxtdk2PRkEpsRq1PAgs5LJEL` | Read project/deployment metadata; latest preview points to commit `11ab6b1`; production remains on `main` commit `107af72` |
| Supabase | Project `careerdev-global`, ref `ufmhrmzumqkjvaezrmxf`, region `eu-west-1` | Read project, table, migration, advisor, function metadata and bounded SQL metadata; no DDL/DML executed |
| OpenAI | Connector environment present | `OPENAI_API_KEY` present; no inference or paid generation used for this audit |

## Architecture summary

CareerDev Global is a Next.js application backed by Supabase Auth, Postgres/RPCs, Storage, and a large Edge Function surface. The live project contains 200+ public tables and 30+ active Edge Functions. AI governance is represented in database tables for prompts, model versions, quality gates, human approvals, usage telemetry, agent execution, and credit metering. Customer AI credits are already reserved and finalized through `reserve_ai_credits` and `finalize_ai_credit_charge`.

## Positive controls verified

- All inventoried public tables report RLS enabled.
- `ai_human_approval_requests` reports forced RLS.
- AI execution and credit functions set an empty `search_path` and use authenticated ownership/role checks in reviewed definitions.
- Credit ledger has a unique `(user_id, idempotency_key)` index and a user/period/status index.
- AI usage policies require human review and enforce token/cost ceilings for the six active governed workflows.
- Most active Edge Functions have JWT verification enabled.
- The Vercel project has SSO protection enabled for non-custom domains.
- Phase 1/2 repository checks and the Phase 2 CI build passed previously.

## Findings ranked by risk

### P1 — Live coach-matching function is not the hardened repository handler

**Evidence:** Supabase deployed `careerdev-coach-matching` is active, version 13, `verify_jwt=false`. Its deployed source uses wildcard CORS, parses unbounded JSON, truncates/filters malformed signals instead of rejecting them, and returns provider error details to callers. The hardened repository handler is not deployed.

**Impact:** Anonymous abuse, cross-origin invocation, information disclosure, and distributed-instance bypass of the in-memory limiter remain possible in production.

**Phase 3 response:** Add a preview-only distributed limiter and shared quota contract, wire the repository handler to use it when explicitly enabled, and keep deployment blocked pending isolated preview validation and owner review.

### P1 — No distributed rate limit currently protects public AI matching

**Evidence:** Repository adapter uses an instance-local map. Live deployed function does not contain an equivalent limiter. Vercel/Supabase instances can therefore enforce separate budgets.

**Impact:** Attackers can fan out across instances and consume embedding/database capacity.

**Phase 3 response:** Add an atomic Postgres-backed limiter RPC with row locking and bounded parameters. It is not applied to the live database.

### P1 — Shared service quota is not yet enforced at the public endpoint boundary

**Evidence:** The database has per-user monthly AI credit reservations and plan usage structures, but no verified endpoint-level shared cap for public coach matching. Existing credit functions should remain the financial/entitlement authority.

**Impact:** A public endpoint can consume shared compute even when individual customer credit ledgers are not involved.

**Phase 3 response:** Add a separate shared quota policy/usage contract. It limits endpoint/service capacity and does not replace user credits.

### P1 — 51 SECURITY DEFINER functions are executable by `authenticated`

**Evidence:** Supabase security advisor reports 51 findings. Bounded metadata confirms examples across admin, AI execution, profile sync, payout, public directory, and credit functions have `authenticated` execute grants.

**Assessment:** This is a high-priority review queue, not proof that every function is exploitable. Some functions perform internal role/ownership checks, while others may intentionally support signed-in users.

**Action:** Do not change grants or RLS in Phase 3 safe implementation. Review each function against the existing authorization matrix before any production grant change.

### P2 — 13 RLS-enabled tables have no policies

**Evidence:** Security advisor reports 13 tables, including audit/observability tables, coach matching preference/results/semantic profile tables, OAuth connection/state tables, email queue, and subscription webhook events.

**Assessment:** No-policy RLS can be intentional for server-only tables, but it must be documented and tested. It may also cause hidden operational failures if a client or authenticated worker is expected to access a table.

**Action:** Keep unchanged. Add to preview authorization tests and review matrix.

### P2 — Leaked-password protection is disabled

**Evidence:** Supabase security advisor reports `auth_leaked_password_protection`.

**Action:** Recommend enabling after owner review; not changed because it is an authentication setting.

### P2 — 187 foreign keys lack covering indexes

**Evidence:** Supabase performance advisor reports 187 unindexed foreign keys.

**Assessment:** Broad optimization should not be generated blindly. Prioritize high-write AI ledger, execution-event, webhook, usage, and booking paths after query plans and workload evidence.

**Action:** No indexes applied. Add a prioritized index review to the infrastructure backlog.

### P2 — Vercel project has no password protection and trusted IP restriction is disabled

**Evidence:** Project metadata reports `passwordProtection.enabled=false` and `trustedIps.enabled=false`; SSO protection is enabled for non-custom domains.

**Assessment:** This is appropriate for a public production site but means preview URLs and public custom domains require application-level controls. No Vercel protection settings changed.

## Recommended infrastructure sequence

1. Validate the new distributed limiter and shared quota contract in an isolated Supabase preview project.
2. Add service-only grants in preview and verify no `anon` or `authenticated` execution.
3. Wire the hardened coach handler with `DISTRIBUTED_RATE_LIMIT_ENABLED=true` only in preview.
4. Run synthetic anonymous, authenticated, quota-exhaustion, concurrency, replay, malformed-input, and stable-error tests.
5. Review the 51 SECURITY DEFINER functions in batches, starting with admin, payment, profile-sync, and AI execution functions.
6. Prioritize unindexed foreign keys using query plans; do not mass-create indexes without workload evidence.
7. Review and separately authorize the Supabase leaked-password protection setting.
8. After preview evidence and owner approval, prepare an explicit production deployment and rollback plan.

## Not performed

- No Supabase migration, table, index, function, grant, RLS, authentication, or data change.
- No Edge Function deployment or production Vercel promotion.
- No OpenAI inference or paid model call.
- No live authorization, rate-limit mutation, quota consumption, webhook, payment, or account test.
- No billing, subscription, or secret changes.

## Current conclusion

The repository can safely contain and test the Phase 3 distributed-control implementation, but **production cannot yet be described as protected by distributed rate limiting or shared quotas**. That claim requires preview deployment evidence followed by a separately reviewed production change.
