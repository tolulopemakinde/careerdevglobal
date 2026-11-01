# AI subscription self-service — draft implementation

Branch: `feature/ai-subscription-management`

## Scope
- Account management page at `/account/ai-subscription` displays current plan, status, period, and eligible published plan information.
- Cancellation requests invoke a new authenticated Edge Function. No client-side database mutation or Paystack secret.
- Upgrade **not enabled** until Paystack provider-side change semantics, proration, currency/interval changes, and webhook reconciliation are verified. The current checkout explicitly rejects active subscribers.

## Release blockers
1. Confirm `get_my_ai_subscription` returns status, billing interval, amount, currency and period end; otherwise expose an owner-scoped projection.
2. Deploy and validate `careerdev-ai-subscription-manage` in an isolated test environment only.
3. Verify Paystack subscription GET returns the cancellation token, disable endpoint behavior, and `non_renewing` entitlement handling. Never mark cancelled on an unverified provider response.
4. Add full upgrade workflow, including no double charges and idempotent provider changes.
5. Add client and coach dashboard navigation links and automated role/ownership tests.
6. Test retries, provider failures, delayed webhooks, RLS, and expiry. Confirm no unintended production changes.

This PR is intentionally a non-production draft; the feature is not complete or release-ready.
