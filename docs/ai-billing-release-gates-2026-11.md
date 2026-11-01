# Billing webhook release gate — 2026-11-01

## Verified read-only production facts
- `ai_agent_subscription_webhook_events(provider_key, provider_event_reference)` has a unique index.
- `ai_agent_subscriptions.paystack_subscription_code` has a **nonunique** index; ambiguous subscription codes can make `maybeSingle()` fail.
- `get_my_ai_subscription()` selects the current user's `active`, `non_renewing`, or `attention` subscription with an unexpired or NULL end date.
- Subscription state constraint permits `pending`, `active`, `non_renewing`, `attention`, `cancelled`, `expired`.

## Implemented in draft PR
- Route AI `charge.success` only after exact subscription identity lookup; reject conflicts with marketplace payment identity.
- Do not acknowledge duplicate AI webhook events as successfully processed unless stored status is `processed`.
- Guard subscription updates with `updated_at` optimistic concurrency; report conflicts for reconciliation.
- Require verified paid-through date and matching provider subscription code before cancellation; detect a zero-row cancellation update.

## Blocking before production
1. A durable retry/reconciliation worker is **not implemented**. Failed, unmatched, or verified-but-unprocessed events require an authenticated operator workflow. Paystack retries alone cannot resolve them with current insert-once logic.
2. The webhook performs multiple DB writes without an atomic transaction. A failure after subscription update and before event acknowledgement can leave a partially applied event.
3. Provider event ordering, timestamp validity, subscription-code uniqueness, and marketplace event routing require behavioral tests.
4. Test checkout, cancellation, and renewal with Paystack sandbox credentials and test accounts. No real-customer charges.
5. Test entitlement credits and access after cancellation, expiry, failed payment, and upgrade.
6. Upgrade flow is not implemented; do not expose an upgrade action.
7. Do not merge or deploy the draft webhook until all gates pass.

## Operator note
An HTTP error on a duplicate `verified`, `failed`, or `unmatched` event is intentional: it signals unresolved processing, **not** safe replay. Investigate event state and reconcile transactionally; do not delete the event to force another insert.

## 2026-11-01 RPC security review
- Verified production event table constraints: primary key, foreign key to subscription (ON DELETE SET NULL), and unique (provider_key, provider_event_reference). There is no DB constraint on processing_status; do not assume arbitrary values are rejected by PostgreSQL.
- The review-only RPC now checks `auth.role() = 'service_role'`, `provider_key='paystack'`, and an explicit supported event allowlist. These are source-review changes only; no SQL was applied.
- **Critical:** A service-role caller can insert an event with `signature_verified=true` without actually verifying Paystack HMAC. The RPC is trusted only behind the authenticated, signature-checking webhook and tightly controlled service-role credentials. Never expose the RPC to browser clients.
- **Critical:** The webhook event insert and RPC are still separate transactions. A verified event can remain pending if the RPC fails; a privileged replay worker is needed. Retry should use the same recorded event ID, not delete/reinsert.
- **Critical:** For initial subscription checkout, event identity must match a unique provider transaction reference; recurring renewal events should match an unambiguous subscription code. No customer-code-only fallback.
- Do not deploy until PostgreSQL test schema validation, malicious payload tests, and Paystack sandbox payment/renewal/cancellation tests pass.

## 2026-11-01 recorded-event retry implementation
- Draft webhook retries already recorded AI events with processing_status `verified`, `failed`, or `unmatched` through the atomic RPC, using the existing event ID. It rejects a payload hash mismatch and does not delete/reinsert records.
- Replay can succeed only after the RPC SQL is deployed and tested. An unmatched event still requires exact provider identity reconciliation; the webhook must not infer ownership from a shared plan/customer code.
- A race during the initial unique-key insert may produce an uncommitted conflicting row; the subsequent lookup must be validated in sandbox under concurrent delivery.
- This does not constitute an operator replay queue or automated monitoring; add those before production.
