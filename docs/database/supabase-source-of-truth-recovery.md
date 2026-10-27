# Supabase source-of-truth recovery and production-readiness plan

**Status:** Recovery in progress — do not treat this branch as a production release.
**Production project:** `ufmhrmzumqkjvaezrmxf` (`careerdev-global`)
**Isolated test project:** `yyevuwvtrktrzwuzeddo` (`careerdevglobal-ai-test`)
**Audit date:** 2026-10-27

## Why this work exists

The project owner confirmed that no separate owner or original migration archive is available. A repository and database review did not recover the SQL bodies for the complete migration chain. The production migration ledger contains 228 entries, but a ledger entry is only version/name metadata; it is not the migration's SQL source.

We must not invent historical migrations or claim that a reconstructed schema is the original applied history. The recovery goal is to create a version-controlled, reproducible baseline that is explicitly reconciled against the live schema, with provenance and known limitations recorded.

## Verified inventory (read-only)

- Production project is active and reports PostgreSQL 17.6.1.166.
- The test project is active and reports PostgreSQL 17.11.0.003.
- Production migration ledger: 228 entries, from `20260914233715_create_careerdev_global_core_schema_v2` through `20261012104608_secure_profile_role_and_status_integrity`.
- Production public schema inventory: 243 tables.
- The final ledger entry is `20261012104608_secure_profile_role_and_status_integrity`.
- A historical candidate file was found at `security/profile-role-authorization-review/supabase/migrations/20261012104600_secure_profile_role_and_status_integrity.sql`. Its version differs from the production ledger by eight seconds. Do not silently rename it or assert it is the exact applied migration.
- The dedicated test project currently has no recorded migrations and no public tables.
- Production has many installed extensions; the complete installed-extension manifest must be captured and reviewed before a clean-room rebuild. Do not assume every extension offered by the platform is installed.
- Active Edge Functions are deployed resources independent of the SQL migration ledger. Their deployed source, configuration, dependencies, and JWT-verification settings must be inventoried and compared with repository sources.

## Safety boundaries

1. Do not apply DDL, migrations, seed data, or destructive operations to production as part of recovery.
2. Do not reset, repurpose, or populate the test project until a reviewed baseline and PostgreSQL-version plan exist.
3. Never export or commit application records, client documents, auth tokens, database URLs/passwords, service-role keys, API keys, or other secrets.
4. Treat production catalog output as evidence of current state, not proof of how that state was created.
5. Keep a reconstructed baseline separate from historical migrations. Mark unknown provenance and any drift explicitly.
6. Keep the LinkedIn Optimization Agent PR in draft until isolated authenticated integration tests and governance checks pass.

## Required source-of-truth artifacts

- `supabase/config.toml`: reviewed project configuration, without secrets.
- `supabase/migrations/`: reviewed, ordered SQL for a reproducible baseline or verified forward migrations. Do not fabricate the missing 228 historical SQL files.
- `supabase/seed.sql` or scoped seed files: synthetic/non-sensitive reference data only; no production records.
- `docs/database/production-schema-inventory.md`: snapshot date, project/version, object counts, extensions, schemas, and capture method.
- `docs/database/schema-drift-report.md`: differences between the reviewed source baseline and the production catalog, including unresolved items.
- `docs/database/edge-function-inventory.md`: deployed function names, versions, JWT-verification settings, repository source path, dependency/config status, and drift.
- Tests for schema invariants, RLS, grants, role/ownership boundaries, status transitions, idempotency, persistence failures, and AI human-review gates.

## Recovery and release sequence

### A. Capture evidence without changing production

1. Export a schema-only snapshot from the owner-authorized production connection using Supabase CLI or an approved database export process. Store it locally in a protected workspace; do not commit raw dumps until they have been reviewed for secrets and environment-specific objects.
2. Record the exact CLI version, command, timestamp, project ref, PostgreSQL version, and dump limitations.
3. Capture catalog metadata for tables/columns, primary and foreign keys, checks, indexes, enums/domains, views/materialized views, sequences, functions/procedures, triggers, RLS policies, grants, publications, and installed extensions where supported.
4. Inventory active Edge Functions and retrieve their deployed source for comparison. Never deploy retrieved production code merely because it is available.

### B. Establish a reviewed baseline

1. Compare the schema-only export with the catalog inventory and the 228-entry migration ledger.
2. Investigate the `20261012104600` versus `20261012104608` discrepancy; preserve both facts until resolved.
3. Identify Supabase-managed schemas and extension-owned objects excluded by the export, and document the exclusions.
4. Create a clearly labelled baseline snapshot migration only after review. A baseline is not a reconstruction of the missing historical migration chain.
5. Verify clean-room application in a disposable, version-compatible database. Compare resulting schema/catalog with the reviewed snapshot.
6. Add only synthetic seed data required for deterministic tests.

### C. Verify LinkedIn Optimization Agent

1. Run static/type/unit checks.
2. Run authenticated end-to-end tests using distinct synthetic client identities and real authorization contexts.
3. Verify ownership and assigned-coach/staff/admin boundaries at the Edge Function layer; do not assume service-role database access enforces RLS on behalf of callers.
4. Verify allowed status mapping, blocked-state preservation, human-review gates, explicit persistence-error handling, idempotency, retries, rate/cost controls, audit trails, and safe logging.
5. Verify document evidence retrieval cannot cross client boundaries and untrusted document content cannot override system instructions.
6. Evaluate recommendation quality and evidence traceability with a reviewed test suite; record failures and limitations.
7. Complete security/performance advisor review, release-candidate review, and rollback plan before any production deployment.

## Supabase schema dump caution

A schema-only dump is a current-state snapshot, not historical migration recovery. Supabase CLI dump defaults and exclusions vary by command/version; verify the installed CLI documentation and inspect the actual output. In particular, managed schemas, extension-created objects, custom roles, grants, and platform-managed configuration may require separate treatment. Do not assume the dump is complete without reconciliation.

## Current release decision

**Not production-ready yet.** Current evidence is enough to begin a controlled source-of-truth recovery, but not enough to declare the test environment reproducible or the LinkedIn Optimization Agent production-ready. No production database changes, migrations, deployments, merges, or data exports are authorized by this document.
