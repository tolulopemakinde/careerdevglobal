# Paystack subscription lifecycle — verified blockers and acceptance tests

Review date: 2026-11-01. This is a development-branch document; production is unchanged.

## Verified existing behavior
- `get_my_ai_subscription()` returns an owner-scoped current subscription, including plan, status, amount, currency, interval and period end.
- The deployed `careerdev-paystack-webhook` maps `subscription.disable` to `canceled`. The entitlement RPC excludes `canceled` and includes `non_renewing`, so a disable event can remove already-paid access prematurely.
- The deployed webhook may correlate by the plan code and select the most recent matching subscription, which is not a safe customer identity.
- The draft account page's cancellation action is now **disabled** until these issues are corrected and tested.
- Existing Paystack checkout rejects active subscribers. Upgrade requires a dedicated provider-verified flow; do not mutate a shared provider plan to upgrade one customer.

## Required remediation before enabling cancellation
1. Match webhook events to a subscription by exact provider subscription code or verified transaction reference. If unmatched or ambiguous, quarantine the event; never select the latest subscription by plan code.
2. Preserve a non-renewing subscription's entitlements through the paid period. Confirm the provider's disable semantics and test event ordering before deciding whether `subscription.disable` means immediate termination or non-renewal.
3. Ensure idempotent webhook processing using a genuine unique event identity; repeated lifecycle events for the same subscription must not collide.
4. Reconcile cancellation state with Paystack after provider confirmation, and make retries safe. Persist audit evidence without logging credentials or sensitive payloads.
5. Validate status transitions, including active, non-renewing, attention, canceled, and expired, against entitlement RPCs and runtime access checks.

## Acceptance criteria
- Client A cannot read, cancel, upgrade or affect Client B's subscription.
- Cancel twice does not trigger duplicate provider side effects.
- Failed provider request does not mark the subscription non-renewing.
- Delayed, duplicate and out-of-order events do not reactivate canceled billing or revoke paid access prematurely.
- User with paid time remaining retains entitlements until the verified end date.
- Expired subscriptions no longer receive paid entitlements.
- Upgrade never changes the shared Paystack plan or creates overlapping active subscriptions.
- USD/NGN and monthly/annual transitions show accurate charges before confirmation.
- No production deployment without sandbox E2E evidence, CI checks, authenticated browser QA and explicit owner approval.
