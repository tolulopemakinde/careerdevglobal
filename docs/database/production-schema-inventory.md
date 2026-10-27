# Production schema and runtime inventory

**Captured:** 2026-10-27 (UTC; connector-observed snapshot)
**Project ref:** `ufmhrmzumqkjvaezrmxf`
**Project name:** `careerdev-global`
**Region:** `eu-west-1`
**Database version:** PostgreSQL `17.6.1.166` (engine 17)
**Capture mode:** read-only project/migration/table/extension/Edge Function metadata calls. No application rows were queried.

> This is a metadata inventory, not a schema dump. It does not contain column definitions, SQL function bodies, policies, grants, triggers, or the source text of migrations. Do not use it alone to rebuild a database.

## Migration ledger

- Count: **228**
- First: `20260914233715_create_careerdev_global_core_schema_v2`
- Last: `20261012104608_secure_profile_role_and_status_integrity`
- The ledger exposes migration version/name records, not the SQL bodies.
- Historical candidate: `20261012104600_secure_profile_role_and_status_integrity.sql` exists on branch `security/profile-role-authorization-review`; its timestamp does not match the production ledger version. This discrepancy remains unresolved.

## Public tables

- Count: **243** in the `public` schema.
- Current table names are returned by the connected Supabase project metadata API; this document intentionally does not duplicate the full list. Capture a dated machine-readable inventory when implementing the baseline-export script.
- Critical domains represented by names include profiles/clients/coaches, service requests and intake, document processing/evidence, AI runs/governance/evaluation/release controls, subscriptions/usage/credits, and marketplace payments/payouts.

## Installed extensions reported by the project metadata API

| Extension | Installed version | Reported schema |
|---|---:|---|
| `pgcrypto` | 1.3 | `extensions` |
| `pg_cron` | 1.6.4 | `pg_catalog` |
| `btree_gist` | 1.7 | `extensions` |
| `pg_net` | 0.20.4 | `extensions` |
| `uuid-ossp` | 1.1 | `extensions` |
| `pg_stat_statements` | 1.11 | `extensions` |
| `supabase_vault` | 0.3.1 | `vault` |
| `vector` | 0.8.2 | `extensions` |
| `plpgsql` | 1.0 | `pg_catalog` |

This list is the set of extensions with a non-null installed version in the returned metadata. It should be cross-checked with `pg_extension` and the reviewed schema-only export before rebuilding. Do not install or remove extensions based solely on this table.

## Active Edge Functions

The project metadata API reported **29 active Edge Functions**. All 29 names, current deployed versions, and `verify_jwt` flags must be captured into the release inventory and compared with source control. The current inventory includes the intake engine, document ingestion/processing/intelligence, AI runtime/evaluation/execution, career intelligence report, coach matching, payment/payout/webhook, subscription, Calendly, email, and support functions.

Important caution: `verify_jwt: false` is reported for some webhook, OAuth, and matching functions. That flag is not automatically a vulnerability (webhooks may use provider signatures and other handlers may authenticate internally), but each such function must have its request-authentication mechanism verified in source and tested. Do not change flags blindly.

## Isolated test project

- Project ref: `yyevuwvtrktrzwuzeddo`
- Name: `careerdevglobal-ai-test`
- Reported database version: PostgreSQL `17.11.0.003`
- Migration ledger count: **0**
- Public table count: **0**

The test project is not yet a reproduction of production. Version difference, schema baseline, extension dependencies, auth/storage behavior, environment secrets, and function configuration must be resolved before using it for end-to-end validation.

## Outstanding inventory work

- Full schema-only export with tool/version/command provenance.
- Columns, types, defaults, generated/identity expressions, constraints, indexes, views, materialized views, sequences, enums/domains, functions/procedures, triggers, policies, grants, and publications.
- Full installed extension details and extension-owned object exclusions.
- Supabase Auth/Storage and platform-managed configuration requirements, captured without exporting user data.
- Edge Function source/configuration/dependency inventory, including deployed-versus-repository drift.
- Reconciliation report and reproducible clean-room test results.
