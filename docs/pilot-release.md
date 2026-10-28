# No-OpenAI pilot release gates

Status: DRAFT. Do not merge or deploy until every gate below passes.

The pilot branch contains the deployed runtime/checkout/verify/webhook source captured on 28 October 2026, amended for structured-only execution and strict payment matching. Production has not been changed by this work.

## Approved prices

| Plan | USD monthly | USD annual | NGN monthly | NGN annual |
|---|---:|---:|---:|---:|
| Fresher | 2.99 | 29.90 | 4,500 | 45,000 |
| Starter | 4.99 | 49.90 | 7,500 | 75,000 |
| Professional | 7.99 | 79.90 | 12,000 | 120,000 |
| Career Pro | 11.99 | 119.90 | 18,000 | 180,000 |
| Elite | 14.99 | 149.90 | 22,500 | 225,000 |

## Validation and remaining work

- Run `node --test tests/pilot.test.mjs tests/pilot-runtime.test.mjs` with Node 24. Local environments restricting child processes can use `--test-isolation=none`; these tests use synthetic data and mock persistence.
- Run TypeScript, all existing validation scripts, source audit, and the full production build.
- Rehearse migration `20261028013535_no_openai_pilot_cutover.sql` against a faithful isolated schema, with pgTAP tests for anonymous/client/coach/staff/admin, ownership, expired subscriptions, prepared requests and configuration/history preservation. The existing AI test project has no migration history; do not assume it is a production clone.
- Audit every other deployed AI entry point, including intake, report, document, service and revision execution. The generic registry gateway alone cannot prove these functions do not call OpenAI directly.
- Verify real Paystack sandbox response shapes for initialization, verification, subscription creation and renewal. Strict verification deliberately rejects missing plan identity and mismatches. Renewal/event-specific reconciliation remains a release gate; do not relax identity checks to make fixtures pass.
- Test duplicate, concurrent and out-of-order checkout/webhook events, subscription expiration and cancelled-subscription preservation with sandbox accounts. No real charges or production test subscriptions.
- Run authenticated browser E2E for all 11 agents, five tiers, two currencies, monthly/annual checkout, mobile/desktop and existing integrations. Mocked handler tests do not satisfy this gate.
- Finish customer-facing copy and remove all entry points advertising paused AI functionality, including Career Intelligence and admin test controls. Preserve layouts, images and animations.

## Coordinated release

1. Record exact main/PR SHAs, existing Vercel deployment and Edge Function versions; capture original deployed sources securely. Freeze checkout during the cutover and reconcile all pending/current subscriptions. Preserve the cancelled Fresher row.
2. Back up the database and rehearse rollback. Stage the production frontend without assigning domains; require the complete tests for that exact commit.
3. Deploy the validated fail-closed execution/payment functions, then apply the tested migration. The checkout price check returns unavailable until prices match. Do not enable new checkout until provider plan reconciliation and webhook tests pass.
4. Verify 12 paused/11 retained, entitlements, exact prices, new provider plan codes, authorization, no provider requests and unchanged cancelled/history records.
5. Merge the exact tested PR revision only after coordinated backend deployment succeeds. Promote the tested production deployment in the existing Vercel project and verify the production alias, authenticated journeys and errors.

## Rollback

Before release, baseline production is Vercel `dpl_NT9XoN6icCoqcmR9jL8teyciJ1RR`, commit `daf9c9697482bd59f72ab69fe5ee9dd2394cd767`. Relevant Edge versions: runtime 25, checkout 7, verify 4, Paystack webhook 15. Refresh before cutover.

If cutover fails: keep checkout unavailable; promote the recorded known-good frontend; redeploy captured original Edge sources with their original JWT/import-map settings. Do not assume function version numbers are a rollback API.

The migration saves old plan rows, registry active flags and service entitlements in private `pilot_private.no_openai_2026_backup`. In a reviewed compensating migration, restore only affected prices/descriptions/included agents/service entitlements, and remove pilot execution triggers/function. Do not automatically restore obsolete Paystack plan codes or reactivate Group C while credits are unavailable. Reconcile new provider subscriptions before restoring pricing. Never delete subscriptions, execution history, configuration snapshots or prompts. The cancelled Fresher record must remain cancelled. Rehearse this compensating migration before production release.
