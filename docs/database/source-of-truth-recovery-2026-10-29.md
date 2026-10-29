# Supabase migration history and schema recovery — 2026-10-29

## Scope and safety

Read-only catalog inspection of Production project `ufmhrmzumqkjvaezrmxf` and existing seeded test project `yyevuwvtrktrzwuzeddo`. No table rows were selected, no database writes or resets were performed, and no secrets were retrieved. Repository evidence was read through GitHub APIs. Evidence artifacts were committed to the existing development branch `codex/calendly-security-hardening`; no PR, merge, or deployment was made.

## Executive result

The original migration SQL history was **not recovered**. Production currently records 229 migration version/name pairs. The inspected GitHub branches contain only three files under `supabase/migrations`; no tags/releases or workflow artifacts yielded the missing chain. Two same-name source candidates have timestamp conflicts. The other 227 Production ledger entries have no matching versioned SQL file in the inspected sources. Do not fabricate these migrations or mark the candidates as applied.

A metadata-only Production snapshot was captured on 2026-10-29 at 2026-10-29T05:55:48.180787 UTC. It includes current columns, constraints, indexes, relation/RLS metadata, triggers, function signatures, extensions, defaults/generation, schemas, views, sequences, and grants. A separate reference file contains the current definitions of 228 public routines. These are current-state evidence, not the historical SQL that produced Production and not a tested rebuild bundle.

## Production migration ledger reconciliation

The refreshed Production ledger contains 229 entries, earliest `20260914233715_create_careerdev_global_core_schema_v2`, latest `20261027234854_calendly_direct_booking_fallback`.

| Classification | Count | Evidence |
|---|---:|---|
| Missing source | 227 | No matching versioned SQL file in 41 inspected branches, tags, or fetched Actions artifacts. |
| Conflicting timestamp; application unverified | 2 | Candidate SQL uses the same migration name but a different version timestamp. |
| Exact source proven | 0 | No SQL source was proven byte-for-byte to be the source applied for any ledger entry. |

Conflicts:

- Production ledger `20261027234854_calendly_direct_booking_fallback`; repository candidate `supabase/migrations/20261028000000_calendly_direct_booking_fallback.sql` on `main`. It was added by commit `0298ea5ce32463fe0ddd3fbe3db22cee7ffb48d3`; the timestamp is 11 hours, 5 minutes, 6 seconds later than the ledger version. Similar name and observed objects do not prove the same SQL was applied.
- Production ledger `20261012104608_secure_profile_role_and_status_integrity`; candidate `supabase/migrations/20261012104600_secure_profile_role_and_status_integrity.sql` on `security/profile-role-authorization-review`. The file timestamp is 8 seconds earlier, and its presence on a non-main branch does not prove it was applied.

The repository also has `20261028013535_no_openai_pilot_cutover.sql` on `pilot-no-openai-pricing-2026`; it has no matching Production ledger entry and is not treated as applied.

The complete per-row classification is in `migration-reconciliation-2026-10-29.csv`.

## Repository, tags, backups, and Actions

- Inspected 41 repository branches and their migration paths; only the three candidate migration files above were found.
- No Git tags or releases were present.
- Queried 126 GitHub Actions runs across two pages and checked their artifacts; none had downloadable artifacts.
- No migration archive or database backup was found in the inspected branch trees.
- The earlier `chore/supabase-authoritative-baseline` inventory was captured 2026-10-27 and explicitly lacked function bodies, policies, grants, triggers, and migration SQL. It was not treated as the current authoritative snapshot.

These searches establish what was present in the queried GitHub sources at capture time. They do not rule out an owner-held local backup, private archive, or export outside GitHub.

## Current Production schema snapshot

Production reports PostgreSQL `17.6` and the metadata capture records:

- 345 relations across visible schemas; public includes 243 tables and 50 views.
- 3,326 columns; 1,328 constraints; 863 indexes.
- 379 RLS policies; 52 user triggers.
- 655 function-signature records across inspected schemas; 228 public routines with definitions in the separate reference file.
- 9 installed extensions and 20 enum types.
- 5 sequences; 74 schema grants, 8,705 relation grants, 2,962 routine grants, and 312 default privilege entries.

The JSON snapshot is a faithful record of catalog metadata returned by the read-only queries, with sequence bounds represented as text to avoid bigint precision loss. It does not contain application table rows. Platform-managed schemas and extension objects are included in the captured metadata; their inclusion does not make this a portable Supabase platform rebuild.

## Existing seeded test project comparison

The existing `careerdevglobal-ai-test` project is not an empty disposable rehearsal environment. It has seeded records and is materially different from Production. It was inspected read-only and left unchanged.

Observed metadata differences:

- PostgreSQL versions differ: Production 17.6, test 17.11.
- Production has two relations absent from test: `public.ai_agent_certification_status` and `public.marketplace_dispute_summary`.
- Column counts match, but `public.coach_semantic_profiles.embedding` differs.
- Constraint counts match, but `public.marketplace_disputes.marketplace_disputes_status_check` differs.
- Production has 31 indexes absent from test; test has 4 absent from Production.
- Production has 41 RLS policies absent from test; `public.profiles.users can create own profile` differs.
- Production has three triggers absent from test: two blog updated-at triggers and the Paystack AI subscription sync trigger.
- Function inventories differ substantially, including six same-signature definitions with differing metadata; extension functions also appear in different schemas, so raw function-count mismatches are not all application routine differences.
- Both have 20 enum types with matching inventory.

Do not use this seeded project for migration replay, reset, or rehearsal. Use a new isolated disposable Supabase branch/project, with owner-approved synthetic seed data and a PostgreSQL/extension baseline aligned to Production. Preserve the existing project.

## Readiness and reproducibility

Artifacts are versioned and dated. The JSON snapshot parsed successfully; the migration CSV has 229 data rows; the 228 public routine definitions were extracted using `pg_get_functiondef`. Static secret-pattern scans found no matches in the committed snapshot/routine text. No migration replay or rebuild was attempted because there is no complete migration chain and no isolated disposable database authorized/available for that purpose. No claim of reproducible database creation is made.

## Recommended source-of-truth recovery path

1. Preserve the existing Production migration ledger unchanged.
2. Ask the project owner to locate any original migration archive, CI artifact, developer workstation backup, or prior schema-only export with provenance. Reconcile recovered files individually against the ledger and current catalog; do not create fabricated SQL for ledger gaps.
3. Treat the dated Production snapshot as an evidence baseline only. If a forward baseline is needed, have the owner approve a clearly labeled baseline strategy and create it from an owner-generated, schema-only export with exact project, capture time, PostgreSQL version, extension versions, and source commit recorded.
4. Rehearse only in a new isolated disposable Supabase branch/project. Apply the reviewed baseline plus subsequent migrations there and compare its catalog with the captured Production metadata before considering any release.
5. Keep production writes, migration-ledger repairs, secret changes, resets, and deployments behind explicit later approval and their own verification gates.

## Files in this evidence update

- `docs/database/snapshots/production-schema-2026-10-29.json`: point-in-time catalog metadata.
- `docs/database/snapshots/production-public-routines-2026-10-29.sql`: routine definitions as reference text, explicitly not a migration or runnable batch.
- `docs/database/migration-reconciliation-2026-10-29.csv`: every Production ledger row and its evidence classification.
- `docs/database/source-of-truth-recovery-2026-10-29.md`: this report.
- `supabase/diagnostics/schema_inventory.sql`: read-only metadata query recovered from the earlier baseline branch.
