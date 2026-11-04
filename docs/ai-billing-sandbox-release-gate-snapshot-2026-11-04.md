# CareerDev Global — isolated billing release-gate snapshot
**Date:** 4 November 2026  
**Target:** `careerdevglobal-ai-test` (`yyevuwvtrktrzwuzeddo`)  
**Scope:** Independent read-only inspection of SQL routine metadata, aggregate account and webhook states, two billing gates, PR source/evidence. No production access, no payment, no user-row retrieval, and no database mutation.

## Actual migration status and reconciliation

The additive replay migration `bind_ai_credit_replay_to_execution` was applied to isolated TEST by a **separate billing development run**, and is recorded in the TEST migration history as `20261104123708` (the draft repository file has timestamp `20261104122023`). Test migration history now contains **23** entries; production history at this checkpoint contained **229** entries. These histories are **not** interchangeable.

Current TEST server is PostgreSQL **17.11**. The deployed `public.reserve_ai_credits` function has MD5 source fingerprint `b9c0ffb6432e9f9da7d8010845df0e77`. Read-only source inspection confirms its existing-ledger replay branch compares `execution_id`, `request_id` and `agent_key` with the incoming request by `IS DISTINCT FROM`. It also preserves the `ai_payment_access_allowed` check, per-user advisory transaction lock, authenticated ownership checks and `SECURITY DEFINER`.

The fingerprint differs from the **original pre-migration snapshot** (`62d121ebc7076de1ac5aaf557e6d5749`) because the test function was modified. The current repository's additive migration includes a source-drift preflight and the patched function body. **Do not reapply it**; its migration record and function state must first be reviewed as deployed.

Separately gathered evidence in PR #42 reports seven authenticated SQL-role checks, a 17-case lifecycle rehearsal and disposable PostgreSQL integration passing after the isolated TEST application. This check independently verifies the deployed function content but **did not repeat those write-based tests**.

## Release-gate status (read-only evidence)

| Gate or fact | Observed | Interpretation |
|---|---|---|
| `ai_billing_release_config.self_service_enabled` | 1 row, 0 enabled | Billing self-service release gate **off** |
| `ai_refund_policy_config.enabled` | 1 row, 0 enabled | Refund-policy release gate **off** |
| Authentication users | 21 total, all created in last 30 days | Age does **not** prove synthetic provenance |
| Explicit app-metadata test/synthetic markers | 0 | TEST account ownership/origin **unverified** |
| User-editable test/synthetic markers | 0 | Also not reliable authorization evidence even if present |
| AI credit ledger | 2 consumed (5 credits); 1 released (3 credits) | Aggregate totals only; no user identifiers read |
| Outstanding reserved ledger rows | 0 | No outstanding reservations in this snapshot |
| Anonymous EXECUTE permission on `reserve_ai_credits` | TRUE | Broader than production; requires least-privilege review. The function checks authenticated ownership, so this is **not** by itself proof of bypass |
| Non-HMAC historical webhook records marked `processed` | 4 `charge.success` events with `signature_verified=false`, `verification_source=provider_api` | Source indicates a distinct provider-API validation path. Requires provider verification/attribution review; do **not** infer forged payment or compromised webhook from this flag alone |

A source inspection of `supabase/functions/careerdev-paystack-webhook/index.ts` found the current HMAC webhook path validates the signature before writing new webhook records. The four older `provider_api`-verified rows require separate review of their creation paths and independently verified receipts; these are not evidence that the current HMAC check is bypassed.

Reproducible aggregate-only SQL: `tests/ai-billing-sandbox-release-audit-readonly.sql`.

## What remains unverified

1. **Account provenance:** Owner-verified isolation of all 21 users, synthetic subscriptions, test payment/provider secrets, and a separate disposable environment for any future write-based acceptance.
2. **Full billing lifecycle:** Matched paid subscription activation (W01), recurring and late payments (W08/W10), policy-enabled reversals/chargebacks, approved-coach/client UI, genuine expired sessions, and replacement workflows (W11/W12/W16) are still incomplete as end-to-end provider/client tests. Database fixtures alone are not substitutes.
3. **Migration rehearsal:** Full owner-authorized schema-only production-shaped baseline and migration reconciliation are incomplete. Do not copy production customer data or replay draft history into production.
4. **Provider evidence:** The distinct `provider_api` event pathway and historical attribution need an audit; existing webhook delivery is not proof of paid subscription entitlements.
5. **Security and operations:** Review wider `anon` `SECURITY DEFINER` permissions, source provenance, integration logs, HTTP timeout evidence, recovery ownership and explicit release authorization.

## Release decision

**HOLD.** No new Supabase writes, live Paystack actions, charge/refund operations, API inference, PR merge, or production deployment were authorized or performed in this read-only checkpoint. Both billing gates remain **disabled**.

The next meaningful owner-gated task is to establish a **verified, truly disposable billing acceptance environment** (no real client records and no live payment keys), then carry out W01 and other missing lifecycle checks under separately approved TEST transactions. The previously proposed NGN 7,500 TEST checkout must **not** be initialized without specific approval for that payment.
