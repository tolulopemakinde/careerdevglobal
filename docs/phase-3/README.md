# Phase 3 — Distributed Rate Limiting, Shared Quotas, and Infrastructure Audit

**Current phase:** Phase 3  
**Branch:** `phase-3-distributed-quotas`  
**Boundary:** Safe implementation only; no production infrastructure changes

## Completed in this tranche

- Performed a fresh read-only audit of GitHub, Vercel, Supabase, OpenAI connector presence, deployed Edge Functions, Supabase advisories, RLS/policy metadata, existing AI credit functions, and quota-related indexes.
- Added a production-blocked SQL contract for:
  - atomic distributed request windows;
  - shared request/credit quota policies;
  - row-locked usage counters;
  - service-only RPC grants.
- Added preview-gated wiring to the tracked coach-matching handler.
- Kept the existing instance-local limiter as an emergency fallback when distributed mode is not explicitly enabled.
- Preserved existing per-user monthly AI credit reservation/finalization as the entitlement authority.
- Added a Phase 3 validator that refuses to treat the SQL as production-applied.
- Added a preview deployment, synthetic test, stop-condition, and rollback plan.

## Important distinction

The repository now contains a **distributed-control implementation and preview migration contract**. The live Supabase function still runs the previously deployed version and has not been changed. Production is not yet protected by these new controls.

## Verification command

```bash
npm run verify:phase3
```

This performs the prior source/type/build-input/auth checks and then validates the Phase 3 preview SQL, service-only RPC markers, handler wiring, and anti-wildcard-CORS contract.

## Open owner-review items

1. Provide or authorize an isolated Supabase preview project.
2. Review the 51 `SECURITY DEFINER` advisor findings before any grant changes.
3. Review the 13 no-policy RLS tables; no RLS was changed here.
4. Decide whether to enable leaked-password protection; no Auth setting was changed here.
5. Approve preview deployment configuration and synthetic authorization/concurrency tests.
6. Only after preview evidence, review an exact production migration, function deployment, environment-variable diff, and rollback plan.

## Next phase

Phase 4 extends this work with production-blocked concurrency simulation and preview operational-readiness evidence. See `docs/phase-4/`.
