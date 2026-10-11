# Phase 1 — Safety and Reliability Foundation

**Branch:** `phase-1-safety-foundation`  
**Status:** Local implementation only; production changes are not authorized.

## Scope

This phase establishes reviewable controls before infrastructure changes:

- Reproducible dependency inputs and build checks.
- A source-level security audit command that fails on likely server-secret exposure.
- A documented AI execution state machine and human-review policy.
- A Supabase/RPC review matrix for the previously observed RLS and `SECURITY DEFINER` findings.
- A release checklist that keeps production deployment, Auth, billing, data, and RLS changes out of this tranche.

## Explicitly excluded

- Supabase SQL, migrations, RLS policies, Auth configuration, Edge Function deployment, or secrets.
- Vercel production promotion or configuration changes.
- Billing, payment-provider, subscription, or payout changes.
- Data deletion or production data mutation.
- Automatic publication or external communication.

## Validation commands

Run from the repository root:

```bash
npm ci
npm run audit:source
npm run typecheck
npm run build
```

`npm run build` remains a local validation step. It is not a deployment command.

## Exit criteria for Phase 1

1. `npm ci` succeeds from the committed lockfile.
2. `npm run audit:source` passes without finding server-only secrets in client-tracked code.
3. `npm run typecheck` passes.
4. The AI state-machine and RPC review matrix are reviewed by the owner before any Supabase remediation.
5. Any later production change is proposed separately with exact SQL/configuration and a rollback plan.

## Current evidence

The read-only Supabase inspection is recorded in [`supabase-observed-controls.md`](./supabase-observed-controls.md). It confirms several meaningful in-function authorization controls while identifying remaining decisions around authenticated execute grants, staff data minimization, public coach matching, governed test-run integrity, and synthetic preview isolation testing.
