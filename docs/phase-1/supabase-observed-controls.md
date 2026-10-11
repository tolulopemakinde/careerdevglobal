# Supabase Observed Controls — Phase 1 Evidence

**Inspection date:** 11 October 2026 (WAT)  
**Mode:** Read-only metadata and function-definition inspection. No application rows were selected, and no SQL write, migration, grant, RLS, Auth, or Edge Function change was performed.

## Verified baseline

The Supabase project is `careerdev-global` (`ufmhrmzumqkjvaezrmxf`). The 13 previously flagged tables still report `rls_enabled=true`, `rls_forced=false`, and `policy_count=0`. This is consistent with a service-role-only/internal-table design, but the intended access class remains unconfirmed for each table.

The inspected security-definer functions are owned by `postgres`. Their configurations generally use one of these patterns:

- `search_path = public`
- `search_path = public, pg_catalog`
- `search_path = public, pg_temp`
- `search_path = ''`

The empty search path is the most restrictive pattern among those observed. Where `pg_temp` is present, it is listed after `public`; this should remain an explicit review point for every function because search-path safety is function-specific.

## Verified positive controls

### Administrative authorization

The sampled functions `admin_set_user_role`, `admin_review_marketplace_payout`, `admin_get_platform_dashboard`, `admin_get_platform_operations`, and `admin_get_platform_analytics` derive the caller from `auth.uid()` and check the caller’s active profile role inside the function. They do not rely solely on front-end route protection.

Observed role boundaries include:

- User-role changes: `admin` only; self-role change is blocked.
- Payout review: `admin` only; action is enum-constrained to `check` or `approve` and payout status is checked.
- Platform dashboard: `admin` or `staff`.
- Platform operations and analytics: `admin` only.
- Payout transfer preparation: `admin` or `staff`, with payout status, currency, transaction payment state, coach ownership, verified default Paystack recipient, and release eligibility checks.

### AI execution and credits

The sampled AI functions contain several meaningful controls:

- `request_ai_agent_execution` requires an active allowed role, checks the agent is active, blocks staff/admin agents for ordinary client/coach callers, and checks subscription inclusion for client/coach agents.
- `prepare_ai_agent_execution` checks active role and request ownership for client/coach users, then snapshots configuration and carries the registry human-approval requirement into the execution.
- `transition_ai_agent_execution` validates permitted states, checks ownership, validates the state transition, and blocks completion when required human approval is absent.
- `reserve_ai_credits` requires authentication, checks active subscription/plan, uses an idempotency key, and treats staff/admin usage separately from customer credits.
- `finalize_ai_credit_charge` restricts ledger access to the authenticated ledger owner and handles already-finalized entries idempotently.
- `run_ai_production_safety_gate` requires staff/admin access and blocks release unless all active client/coach agents pass the listed certification gates.

These controls support the platform’s stated principle that AI prepares while humans decide. They should still be covered by automated role-isolation and transition tests.

### Profile synchronization

`apply_profile_sync_proposal` and `apply_profile_sync_proposal_v2` require active staff/admin authorization, require an approved proposal, and in the v2 function require a reviewer and verified evidence. The v2 function also limits target entities and fields, verifies client ownership of target records, and writes profile change history.

This is a strong pattern for preventing AI extraction from silently overwriting a user’s career record. The remaining review question is whether every profile mutation path uses these proposal functions rather than direct table writes.

### User-owned reset

`reset_career_intelligence_workspace` is executable by `authenticated` but checks `auth.uid()` through the client relationship, restricts resettable request states, and deletes the request plus associated storage objects. This is a consequential user-owned deletion flow even though it is not an unrestricted admin function.

Before production use, it should have a dedicated confirmation/audit policy, predictable retention behavior, and tests proving that a client cannot reset another client’s request. No reset was executed during this inspection.

## Review findings requiring owner decision

### R1 — Broad `authenticated` execute grants remain

The following high-impact functions were confirmed executable by the `authenticated` role, even though their bodies contain role checks:

- `admin_get_platform_dashboard`
- `admin_get_platform_operations`
- `admin_get_platform_analytics`
- `admin_set_user_role`
- `admin_review_marketplace_payout`
- `prepare_coach_payout_transfer`
- `apply_profile_sync_proposal`
- `apply_profile_sync_proposal_v2`
- `finalize_ai_governed_test_run`
- `get_ai_credit_admin_summary`
- `get_ai_credit_admin_usage`
- `run_ai_production_safety_gate`
- `publish_coach_career_insight`
- `request_ai_agent_execution`
- `prepare_ai_agent_execution`
- `transition_ai_agent_execution`

**Interpretation:** authenticated execute permission is not itself proof of vulnerability when the function performs correct internal authorization. It does increase the attack surface and makes complete function-level review mandatory. The owner must decide whether privileged functions should instead be executable only by `service_role` or by a narrower application role, while preserving intended browser RPC flows.

### R2 — Staff dashboard data minimization

`admin_get_platform_dashboard` includes profile-level fields such as names, email addresses, country, status, and creation time for both `admin` and `staff`. `admin_get_platform_operations` returns broad operational collections to `admin` and includes payment/payout-related data.

This may be intentional for platform operations, but the least-privilege question is whether staff needs all profile and financial fields. A safer future design would separate dashboard aggregates, operational queues, and sensitive finance views into narrowly scoped functions with explicit column allowlists.

### R3 — Admin execution function should be tested as a control-plane action

`finalize_ai_governed_test_run` correctly requires staff/admin access and a governed test trigger, but it writes test-run and suite-run records based on supplied output JSON. It should be tested for:

- request ownership of the governed test context;
- immutable linkage to the expected test case;
- payload size limits;
- protection against forged expected-status fields;
- audit event completeness;
- repeat submission/idempotency behavior.

### R4 — Public matching boundary needs alignment with RPC grants

`find_public_coach_matches`, `get_public_coach_directory`, and related public-coach functions are executable by `authenticated` according to the metadata inspected. The public Edge Function was previously observed with `verify_jwt=false`. The runtime path must therefore be mapped precisely: either the Edge Function uses a service-role client, or anonymous callers could be blocked at the RPC layer despite the public UI.

This is not a production change request. The next safe step is an isolated integration test using synthetic/public-safe data, not an anonymous production probe that consumes resources or exposes records.

## Required test matrix before any grant/RLS change

| Test | Expected result |
|---|---|
| Anonymous caller invokes admin RPC | Rejected |
| Authenticated client invokes admin RPC | Rejected |
| Authenticated staff invokes admin dashboard | Only approved staff fields returned |
| Authenticated client requests another client’s AI execution | Rejected |
| Authenticated client finalizes another user’s credit ledger | Rejected |
| Authenticated client completes human-review-required execution | Rejected until approved record exists |
| Authenticated coach applies a profile-sync proposal | Rejected; staff/admin required |
| Authenticated client resets another client’s workspace | Rejected |
| Authenticated client submits oversized/invalid AI payload | Rejected or bounded |
| Duplicate credit reservation with same idempotency key | No double charge |
| Duplicate payout preparation | No duplicate provider transfer reference |
| Public coach matching returns private coach fields | No private fields returned |

## Current disposition

No production remediation is authorized under the current execution boundary. The evidence supports moving from a generic advisory list to a targeted review of:

1. privilege minimization and staff data exposure;
2. public matching Edge Function/RPC alignment;
3. AI test-run integrity and idempotency;
4. proof that all AI/profile mutations pass through governed functions;
5. synthetic isolation tests in a separately identified preview project.
