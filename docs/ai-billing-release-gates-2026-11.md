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
