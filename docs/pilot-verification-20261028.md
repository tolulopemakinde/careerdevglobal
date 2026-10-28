# Pilot verification checkpoint — 28 October 2026

Release remains blocked. No production migration, Edge deployment, merge or promotion was performed.

## Source changes

The nine direct provider-dependent pipelines now use an authenticated, provider-free pause handler: intake v1/v2, document processor/classifier/intelligence, intake-answer intelligence, service execution, revision execution and career-intelligence report. The central runtime continues to serve the 11 structured agents. No paid replacement provider was added.

Career Intelligence saves information without invoking the paused pipelines and links to the 11 structured agents. The original system section anchor and animation selectors remain intact. Admin governance retains all registry records; provider-dependent admin/blog actions are paused. Talent-mobility guidance and service workflow drafts require human review. Existing prompts/configurations/historical outputs are not deleted.

## Evidence

- 29 local synthetic unit/handler tests pass, including all 12 Group C keys across client/coach/staff/admin roles and the nine direct-pipeline pause handlers.
- TypeScript and the source audit pass.
- Nine pause handlers were deployed only to `careerdevglobal-ai-test` (`yyevuwvtrktrzwuzeddo`), each at version 1 with JWT verification enabled.
- 45 real HTTP checks pass in that isolated project: nine pipelines across four authenticated roles return `409 PILOT_AI_PAUSED`; nine anonymous calls return 401. These are live pause-boundary tests, not proof that all 11 positive workflows or Paystack billing work end to end.
- A separate JWT-protected, staff/admin-only sandbox preflight was deployed in the test project. It rejects non-test Paystack secrets and makes no charge. Its authenticated request returned 503 because a test-mode `PAYSTACK_SECRET_KEY` is not configured there. The user confirmed that the existing key is in production and that the test-project configuration cannot be corrected now. No production key was retrieved or copied.

## Isolated schema work

Supabase branching is unavailable on the current plan: `Branching is supported only on the Pro plan or above`.

The empty AI test project was populated with 208 recorded migration steps, excluding the administrator bootstrap and production email scheduler. This used definitions/reference catalog seeds, not customer records. Replay revealed unrecorded schema objects: 16 table definitions were missing from history, as were current function definitions and other changes. Scoped reconciliation added 10 remaining table structures, 21 missing columns, 72 missing constraints, five plan catalog records, the 16 customer-agent catalog records and synthetic test identities.

The historical replay has been stopped. The remaining current gateway function reconciliation is incomplete: PostgreSQL rejects replacing the old `request_ai_agent_execution` signature because the current definition removes old parameter defaults. No destructive function replacement was attempted after this failure. The test project must not yet be represented as a faithful production clone or used to claim completed RLS/migration/rollback verification.

The Supabase connector prompted repeatedly because its automatic safety check flags destructive SQL in each historical batch. Further work should use reviewed, scoped reconciliation rather than broad history replay. Connector safety checks must remain enabled.

## Required before release

1. Configure a Paystack test-mode key directly as `PAYSTACK_SECRET_KEY` in the isolated test project, then pass sandbox checkout, verification, renewal, cancellation and webhook lifecycle tests. Production credentials cannot substitute for sandbox verification.
2. Complete and compare the isolated schema, function defaults, policies, grants, triggers and reference configurations. Rehearse the pilot migration and compensating rollback, preserving cancelled subscriptions and historical records.
3. Complete the payment implementation's event-specific renewal matching, retry/idempotency and ordering protections; the earlier strict original-reference validation is not a complete renewal implementation.
4. Run authenticated positive browser E2E for the 11 agents, billing variants, mobile/tablet/desktop and existing integrations.
5. Pass CI and preview builds for the final complete revision, coordinate backend cutover and only then merge/promote.

Original deployed provider-function source and version metadata were captured locally for rollback. Test fixtures and authentication sessions remain local intermediate files and are not committed. No production data has been changed or deleted.
