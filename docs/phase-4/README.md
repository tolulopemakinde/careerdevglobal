# Phase 4 — Preview Validation and Operational Readiness

**Current phase:** Phase 4  
**Boundary:** Production-blocked; no preview project or live database mutation was performed

## Assumed Phase 4 scope

Phase 4 converts the Phase 3 distributed-control contract into a verifiable preview test and operations package. It does not infer authorization to create a Supabase project, test users, secrets, provider calls, or production deployments.

## Completed

- Added a deterministic local concurrency model for distributed request windows.
- Added a deterministic local shared-quota model.
- Verified that the models do not overshoot configured limits under concurrent calls.
- Verified expired limiter windows reset and return bounded retry data.
- Added operational readiness and production change-packet requirements.
- Kept all preview and production execution explicitly blocked.

## Verification command

```bash
npm run verify:phase4
```

The command includes all Phase 1–3 checks and the Phase 4 deterministic model simulation.

## What this does not prove

The simulation does not prove Postgres row locking, Supabase RPC grants, Edge Function deployment behavior, or production protection. Those require a separately verified isolated Supabase preview environment.

## Current deployment verification

The four phases have successful Vercel preview deployments, but production remains on `main` commit `107af72`. Supabase still serves the pre-hardening coach-matching function version 13. See `deployment-verification-2026-10-11.md` for the read-only evidence and the exact remaining rollout gap.

## Required preview evidence

1. Concurrent calls from multiple function instances stop at the configured limiter and quota boundaries.
2. `anon` and `authenticated` cannot call service-only RPCs.
3. Preview Edge Function fails closed when distributed configuration is missing.
4. Correlation IDs, redacted diagnostics, quota denials, and retry times appear in protected logs.
5. Existing customer credit idempotency and human-review state transitions remain intact.
6. Synthetic authorization, webhook, payment, and cross-user isolation cases pass.
7. No request, secret, or provider call reaches the production project.

## Production change packet required later

Before production authorization, record the exact:

- migration hash and SQL diff;
- Edge Function commit and deployed version;
- environment-variable diff, excluding secret values;
- quota policy values and effective reset periods;
- observability dashboard/alert thresholds;
- deployment ID and smoke-test evidence; and
- rollback sequence and database backup/restore plan.

## Not performed

No preview project, user, secret, provider, migration, Edge Function deployment, Vercel promotion, RLS/grant change, authentication setting, billing setting, or production data operation was created or changed.
