# Calendly booking dependency inventory — read-only snapshot

Inspection date: 2026-10-28. **No database writes or production deployments.**

## Database function dependencies
Functions referencing `public.marketplace_booking_requests`:
`admin_get_platform_analytics`, `admin_get_platform_dashboard`, `admin_get_platform_operations`, `admin_update_booking_status`, `cancel_marketplace_booking`, `coach_confirm_marketplace_booking`, `create_marketplace_booking_request`, `create_marketplace_transaction`, `marketplace_booking_notification_automation`, `process_due_marketplace_reminders`, `schedule_marketplace_booking_reminders`, `send_marketplace_communication`.

The list is derived from `pg_get_functiondef` text search and may miss dynamic SQL or indirect dependencies. Review each function definition and caller before restricting grants.

`coach_confirm_marketplace_booking` and `cancel_marketplace_booking` are SECURITY INVOKER and perform writes to booking requests and slots. The booking creation RPC is SECURITY DEFINER. A blanket revoke of authenticated UPDATE/INSERT may break these paths. `admin_update_booking_status` requires separate role/privilege review.

## Related tables
- `marketplace_booking_requests`: all columns writable by authenticated at privilege level; ownership RLS for coach UPDATE; booking and Calendly metadata mutable.
- `marketplace_booking_slots`: coach-manage ALL policy and staff ALL policy. Audit for arbitrary slot manipulation and overlap bypass.
- `marketplace_booking_events`: authenticated participant INSERT policy; validate event spoofing and audit provenance.
- `calendly_connections` and `calendly_oauth_states`: no public RLS policies returned; service-role Edge Functions own writes. Preserve this boundary; never grant token table SELECT to client roles.

## Frontend/Edge Function call chain
`app/coach-dashboard/page.tsx`:
- `confirm` -> `careerdev-calendly-booking` action `book` -> `coach_confirm_marketplace_booking` RPC.
- `decline` -> `cancel_marketplace_booking` RPC.
- `cancelConfirmed` -> Edge Function action `cancel` -> `cancel_marketplace_booking` RPC.

`app/coach-dashboard/calendly-panel.tsx`: OAuth status, event-type fetch, and direct `coach_service_offerings` event-type URI mapping.

Deployed `careerdev-calendly-booking` v10: action `book` calls Calendly POST /invitees, then writes local Calendly metadata; local update errors are not checked. Action `cancel` calls external cancellation without writing local cancellation state.

## Findings requiring design review before a runnable migration
1. Direct client UPDATE privileges on all booking request columns.
2. Direct coach management of booking slots under an ALL policy.
3. Booking event insertion may permit participant-supplied audit events.
4. External booking before local slot reservation.
5. Missing checked persistence/reconciliation after external success.
6. Direct booking fallback is separate from marketplace scheduling and payments.
7. Missing complete authoritative migration history and nonproduction environment.

## Proposed sequencing
1. Inspect remaining function bodies, policies, grants, triggers and all frontend writers.
2. Define controlled status transitions and internal authorization boundary. Do not change SECURITY INVOKER functions to SECURITY DEFINER without a threat-model review and tests.
3. Add tests in an isolated environment for role grants, RLS, event forgery, slot conflicts, concurrency, retry and reconciliation.
4. Build and validate SQL migration plus Edge Function source changes; only then revoke broad privileges.
5. Verify production release plan, owner approval, staged rollout and rollback.

This is an evidence inventory, **not an executable migration**.
