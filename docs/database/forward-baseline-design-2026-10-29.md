# Forward Supabase baseline design — 2026-10-29

**Status: design and acquisition plan only. No complete schema-only export was obtained; no baseline is validated.**

Repository: `tolulopemakinde/careerdevglobal`  
Branch: `codex/calendly-security-hardening`  
Production project ref: `ufmhrmzumqkjvaezrmxf`

## 1. Decision and scope

The original 229 Production migration sources remain unrecovered. Per owner direction, this design does not continue searching for historical files, recreate missing SQL, or write a synthetic migration version into the Production ledger.

The existing October 29 evidence is a useful, dated catalog record, but it is **not** a complete SQL baseline. The connected Supabase tools can run read-only SQL and return catalog metadata; they do not provide a schema-dump file operation. No linked local repository or database password was available to run the Supabase CLI dump. I did not retrieve, request, or expose a Production password.

The official Supabase CLI reference documents `supabase db dump` as a remote `pg_dump` wrapper. Its default output is schema-only (no application data and no custom roles); it filters Supabase-managed schemas, including `auth`, `storage`, and extension-created schemas. It requires a locally linked project or a database URL. Therefore the complete SQL export must be generated in the owner's trusted, linked local environment and reviewed before committing. See [Supabase CLI: db dump](https://supabase.com/docs/reference/cli/supabase-db-dump) and [Supabase local CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows).

## 2. Review of October 29 artifacts

The branch artifacts are present and their labels are appropriate:

- `source-of-truth-recovery-2026-10-29.md` reports no exact applied migration source, 227 missing sources, and 2 timestamp-conflicting candidates. It labels the inventory a point-in-time snapshot, not history.
- `migration-reconciliation-2026-10-29.csv` has 229 ledger rows: 227 `missing_source`, 2 `conflicting_timestamp_unverified`. No entry is called recovered or applied.
- `production-schema-2026-10-29.json` is a 6,365,091-byte catalog metadata snapshot. It parsed as JSON before commit and its Git tree size matches the captured payload. The GitHub file-content connector returns an empty body for this oversized file, so I could not re-read its full body through that connector during this review.
- `production-public-routines-2026-10-29.sql` contains 228 `pg_get_functiondef` results for public routines. Its header says reference-only, not a migration or safe batch.
- `schema_inventory.sql` is explicitly metadata-only and not a schema-only dump.

The metadata snapshot records columns, constraints, indexes, relations, RLS policy definitions, triggers, function signatures, extension versions, views, sequences, defaults/generation, and schema/relation/column/routine/default grants. The separate routine file contains public routine bodies. Neither provides a dependency-ordered full DDL dump for all application objects. The evidence is complete for the scope claimed by its labels, but insufficient to establish a portable baseline.

A read-only role-metadata query found no application-defined custom roles; the returned nonstandard roles were Supabase-prefixed platform roles. Do not export platform role definitions. Preserve the object grants recorded in the schema dump, and review their target role names against the standard roles available in the target Supabase project.

## 3. Authorized schema-only acquisition

Run this in a trusted local checkout of this repository. Do not paste a database URL, password, access token, or CLI credential into Codex, chat, GitHub, or the output file.

1. Install/use the owner-managed Supabase CLI and Docker environment. Link the local checkout to project `ufmhrmzumqkjvaezrmxf` using the CLI's secure local credential flow.
2. Generate the default schema dump (do **not** pass `--data-only` or `--role-only`):
   ```sh
   supabase db dump --linked --file supabase/baselines/production-schema-2026-10-29.sql
   ```
3. Record the actual capture timestamp, CLI version, Production PostgreSQL version, extension names/versions/schemas, source project ref, and SHA-256 of the resulting file in a companion manifest. Record no credentials.
4. Inspect the generated SQL to confirm it contains no `COPY`, `INSERT`, user records, secret values, token values, or platform-only schema contents. Confirm application DDL, constraints, indexes, functions, triggers, policies, grants, and required extension declarations are present. Review extension-managed objects separately because the CLI filters their schemas.
5. Keep the dump local until the review passes. Commit it only to `codex/calendly-security-hardening` after confirming it is non-secret and contains no data.

Do not use a raw Production connection string in command arguments or check it into files. The CLI's documented default dump excludes data and custom roles, but the generated output must still be inspected before it is treated as a source artifact. A dump that omits required app objects, their extension dependencies, or grants is incomplete and must not be called the baseline.

### Captured extension manifest (observed 2026-10-29)

These values are provenance evidence, not a promise that every version can be installed on a new Supabase project. Verify target support before rehearsal. Do not restore platform-owned extension schemas or vault contents.

| Extension | Version | Observed schema |
|---|---:|---|
| btree_gist | 1.7 | extensions |
| pg_cron | 1.6.4 | pg_catalog |
| pg_net | 0.20.4 | extensions |
| pg_stat_statements | 1.11 | extensions |
| pgcrypto | 1.3 | extensions |
| plpgsql | 1.0 | pg_catalog |
| supabase_vault | 0.3.1 | vault |
| uuid-ossp | 1.1 | extensions |
| vector | 0.8.2 | extensions |

The baseline must record which extensions are application dependencies and which are supplied/managed by Supabase. In particular, never export vault data, auth/storage contents, connection credentials, JWT settings, provider settings, or secrets. Platform-managed schemas such as `auth`, `storage`, `realtime`, `vault`, `cron`, and `net` are excluded from an application baseline unless a reviewed dependency requires a specific non-sensitive declaration.

## 4. Forward-only source-of-truth conventions

After the complete export passes review:

- Store the canonical, dated schema capture under `supabase/baselines/`, outside `supabase/migrations/`. Include a manifest with source project ref, capture time, PostgreSQL/extension versions, CLI version, SHA-256, included application schemas, excluded platform schemas, and review status.
- Keep `supabase/migrations/` for actual, newly authored forward changes only. Create each new migration with the current supported Supabase CLI migration command; use a descriptive name and let the tool generate its timestamp. Never reconstruct a historical file from the ledger name.
- Keep the original 229-row Production ledger unchanged. Do not add a baseline marker, rewrite history, or run migration repair to make local history appear complete.
- A baseline file is evidence/bootstrap input, not proof that its SQL ran successfully. Mark it “validated” only after a successful disposable-environment rehearsal and structural comparison.
- Keep the unrecovered-history reconciliation alongside the baseline manifest so future maintainers can distinguish documented history gaps from forward migration history.

### Fresh-install strategy

Use an explicitly identified, new, empty, isolated project. Apply the reviewed baseline once through a documented bootstrap step, then apply only migrations created after the baseline cutoff. Store the fresh-install target class and baseline file hash in deployment configuration/release records. Do not use the seeded `careerdevglobal-ai-test` project.

### Existing Production strategy

Production is classified as `existing_production` by the exact project ref and its existing ledger. Never apply the baseline to it and never insert a baseline version into its ledger. Future schema changes must be authored as genuine forward migrations and recorded as such by the eventual approved deployment process.

Before using the ordinary CLI push workflow on Production, prove in a disposable rehearsal that it can apply only new forward migrations while preserving all 229 existing ledger entries. If the tooling asks to reconcile, repair, or mark any historical version, stop. No Production release is authorized by this design.

These target classes must be explicit in any later deployment workflow; a missing/unknown project ref must fail closed. The fresh-bootstrap path and existing-Production path must not share an automatic “apply baseline” step.

## 5. Nonproduction rehearsal procedure

No rehearsal environment was created. Creating a paid project or branch requires separate explicit owner approval; no resource was created. The existing seeded AI test project is not to be reset, modified, or used for replay.

Once a complete reviewed export exists and the owner approves an isolated environment:

1. Prefer a new empty disposable Supabase project. If using a branch instead, first confirm its data isolation and cost; use synthetic data only.
2. Record the environment/project ref, PostgreSQL version, extension availability/versions, capture hash, and CLI version. Match Production's PostgreSQL major version and resolve extension differences before applying the baseline.
3. Apply the baseline using the fresh-install bootstrap path. Do not import Production data or copy user rows.
4. Capture the resulting catalog with the metadata-only inventory query. Compare normalized app schemas, tables/columns/defaults, constraints, indexes, enums/types, views, function definitions, triggers, RLS policies, grants, and extension dependencies against the Production snapshot and reviewed dump.
5. Verify no RLS-enabled app table has an unintended policy gap; compare grants and role targets; inspect security-definer functions and search paths; verify trigger attachment and enabled state.
6. Run schema integrity checks and document every expected platform/version difference separately from unexpected drift. Add workflow-level authorization/concurrency tests only after the Calendly hardening implementation exists.
7. Record pass/fail evidence and discrepancies. A successful CLI exit or a passing metadata count alone is not a successful rehearsal.

## 6. Calendly booking hardening plan (not implemented)

Baseline verification is a prerequisite to any schema change. After that gate:

1. Inventory every writer to `marketplace_booking_requests` and map current Coach/Client Dashboard workflows.
2. Define narrow server-side operations for create, confirm, cancel, and allowed updates. Revoke direct client/coach writes to protected ownership, status, payment, and Calendly fields while preserving legitimate reads and dashboard actions.
3. Add an atomic claim/uniqueness mechanism before calling Calendly. Use a stable request key and database constraints/transactions to serialize retries and concurrent submissions.
4. Model the external booking as a recoverable workflow: persist claim, call Calendly, persist confirmed result; record uncertain outcomes and reconcile by provider evidence rather than blindly retrying. Verify Calendly idempotency support before depending on it.
5. Make cancellation update local state only after provider outcome is known; add reconciliation for partial cancellation failures.
6. Add tests with separate client and coach identities, authorization boundary tests, concurrent/retry tests, partial failure injection, cancellation mismatch tests, and existing dashboard workflow regression tests.
7. Rehearse the migration and rollback in the approved disposable environment. Keep Production code/schema deployment behind a separate owner release gate.

No production changes or booking tests were performed.

## 7. Blockers and next action

The complete schema-only SQL export is the blocker. The available Supabase MCP tools support read-only SQL, not a `pg_dump` artifact download; the remote catalog snapshot is not a substitute. An owner-managed local CLI environment linked to the Production project is required to produce the export without disclosing a password to Codex.

The next safe action is for the owner to run the documented CLI dump locally and place the reviewed, non-secret file plus manifest on this development branch. Then the export can be reviewed, compared, and rehearsed only after an isolated environment is explicitly approved. Until that succeeds, there is no validated baseline, no schema comparison result, and no Production release path opened.
