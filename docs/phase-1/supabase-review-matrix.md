# Supabase Review Matrix — Phase 1

This is a review artifact only. It does not apply SQL, modify RLS, or change grants.

## RLS-enabled tables with no policies

Each table must be assigned an intended access class before remediation:

| Table | Intended class | Expected access path | Owner decision | Follow-up |
|---|---|---|---|---|
| `ai_agent_subscription_webhook_events` | service-role-only | Signed webhook Edge Function | Pending | Confirm Paystack/subscription webhook writes |
| `ai_audit_events` | service-role/admin-read | Runtime/admin RPC | Pending | Confirm audit immutability and admin visibility |
| `ai_observability_daily` | service-role/admin-read | Scheduled aggregation/admin RPC | Pending | Confirm dashboard access path |
| `ai_operational_alerts` | service-role/admin-read | Alerting/admin RPC | Pending | Confirm notification delivery |
| `ai_output_provenance` | owner/admin-read | Approved RPC/runtime | Pending | Confirm client-visible provenance fields |
| `ai_output_versions` | owner/admin-read | Approved RPC/runtime | Pending | Confirm version history visibility |
| `ai_workflow_revision_executions` | service-role/admin-read | Workflow runner/admin RPC | Pending | Confirm no client direct access is needed |
| `calendly_connections` | owner/service-role | OAuth/booking Edge Functions | Pending | Confirm coach ownership checks |
| `calendly_oauth_states` | service-role-only | OAuth callback | Pending | Confirm state expiry and one-time use |
| `coach_match_results` | owner/admin-read | Matching runtime/client RPC | Pending | Confirm result ownership and retention |
| `coach_matching_preferences` | owner-only | Client matching flow | Pending | Confirm authenticated client access path |
| `coach_semantic_profiles` | approved public-read | Matching runtime/public listing | Pending | Confirm fields do not expose private coach data |
| `email_notification_queue` | service-role-only | Notification dispatcher | Pending | Confirm no client access is required |

## `SECURITY DEFINER` function review checklist

For every flagged function, record:

- `SECURITY DEFINER` is required; otherwise use invoker security.
- Explicit `search_path` is safe and does not allow object shadowing.
- `EXECUTE` grant is limited to the required role(s).
- Caller identity is derived from `auth.uid()` or a trusted server context.
- Role/ownership checks occur inside the function, not only in the UI.
- Inputs are validated, bounded, and enum-constrained.
- Mutations are scoped to the intended tenant/user/resource.
- Sensitive output columns are excluded.
- Financial/credit operations are idempotent.
- Audit event is written for consequential changes.
- Error messages do not disclose secrets or private records.
- Test cases exist for client, coach, staff, admin, anonymous, and cross-user access.

## Priority function families

1. Role and profile mutation: `admin_set_user_role`, profile status and marketplace status functions.
2. Financial operations: payout preparation/review/transfer, provider status, refunds and transactions.
3. AI credits: reserve, finalize, refund/release, subscription entitlement checks.
4. AI execution: request preparation, transitions, release candidates, output publication.
5. Content publication: blog and coach insight publication.
6. Analytics and dashboards: ensure outputs are aggregate or authorized.

## Review outcome values

Use only: `approved`, `needs-change`, `service-role-only`, `safe-as-invoker`, `blocked-pending-owner-decision`, or `not-applicable`.
