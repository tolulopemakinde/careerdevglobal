# Calendly lifecycle acceptance — 17 November 2026

Status: local implementation and rehearsal advanced; live Calendly acceptance and production release remain HOLD. PR #48 stays draft and unmerged. This report supersedes the earlier report's missing-lifecycle findings. Starting implementation was `9fdee62`; lifecycle changes are `6a25be1`, `cc59b29` and `433fa25`. None has been deployed to a hosted Supabase project.

## Implemented behavior

- The authenticated coach UI → durable Edge route is preserved. A provider timeout cannot fall back to the legacy route. A new acceptance database guard also blocks legacy/admin changes to booking rows and slot holds while a durable operation is unresolved; only the service-only completion operation can authorize those updates.
- Token refresh uses encrypted credentials, a database-unique per-coach claim, scope and host verification, and compare-and-swap persistence. Concurrent requests cannot both rotate a refresh token. Ambiguous rotation retains the claim and requires owner grant review/reconnection; it is never blindly retried. OAuth connection persistence shares the lifecycle lock with refresh/revocation.
- Authenticated subscription actions support `subscription_ensure`, `subscription_list`, `subscription_reconcile` and `subscription_delete`. They manage only the designated user, organization, exact acceptance callback and two invitee event types. A durable create intent precedes POST; a lost response is recovered by listing, never by another POST. Duplicate matches require review. Reconciliation can recover a crashed creator's lock when a matching subscription is found.
- Disconnect deletes the owned subscription, makes the connection inactive, revokes refresh/access credentials and deletes the credential row only after provider acknowledgement. An uncertain revoke preserves encrypted recovery material and the claim; repeating the authenticated disconnect resumes idempotent revocation. Failed refresh claims are not stolen to attempt disconnect; owner revocation/reconnection review is required in that case.
- The webhook receiver verifies the bounded raw request with the OAuth app's signing key and a three-minute timestamp tolerance. It stores a minimized durable receipt without participant payloads. Semantic event/resource identity deduplicates retry deliveries with different signatures. Database leases serialize workers and protect against stale workers overwriting a newer result.
- Recovery uses provider GETs and the existing durable completion/reschedule functions. It validates operation tracking, designated host, event type, times and linked invitee; it cannot create or cancel a provider appointment. It supports confirmation response loss, cancellation reconciliation and a verified hosted reschedule. Unknown operations are ignored; ambiguous or out-of-order evidence stays pending. The authenticated `webhook_recover` action retries up to 100 pending/expired-processing receipts. Background receipt processing uses EdgeRuntime.waitUntil; no production scheduler was configured.

The SQL remains an acceptance candidate outside migrations. Apply the recovered schema, then `calendly-operations.sql`, `calendly-reschedule.sql` and `calendly-lifecycle.sql` only to an approved empty isolated target. Existing protected projects are rejected by the handlers. Do not transplant the reduced fixture to a hosted database.

## Registration scopes and secret configuration

The minimum requested scope string for the implemented endpoint set is:

```text
users:read event_types:read scheduled_events:write webhooks:write
```

`users:read` covers host identity; `event_types:read` covers type ownership and event-type available times; `scheduled_events:write` covers invitee creation/cancellation and implicitly event/invitee reads for reconciliation/rescheduling and invitee webhook payloads; `webhooks:write` covers subscription creation/deletion and implicitly subscription listing. OAuth refresh/revocation adds no resource scope. No organization API, busy-time or user-schedule endpoint is called, so `organizations:read` and `availability:read` are not requested. Organization URI is an explicit designated-host setting, not inferred through organization-wide reads.

Provider references checked November 17: [scope hierarchy and endpoint catalog](https://developer.calendly.com/docs/authentication/scopes), [subscription ownership/events](https://developer.calendly.com/api-docs/calendly-api/webhooks/create-webhook-subscription), [OAuth app webhook signing](https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures), [token revocation](https://developer.calendly.com/api-docs/calendly-o-auth/o-auth/post-oauth-revoke).

In the **isolated Supabase Edge secret manager**, configure the settings in the [setup checklist](acceptance-setup-and-route-readiness-2026-11-17.md), plus `CALENDLY_ACCEPTANCE_ORGANIZATION_URI`, `CALENDLY_WEBHOOK_URI` and `CALENDLY_WEBHOOK_SIGNING_KEY`. The signing key must belong to the owner-designated OAuth app; OAuth webhooks use the app-generated key, not a newly invented per-subscription key. The webhook URI must exactly equal that isolated backend's `/functions/v1/careerdev-calendly-webhook` endpoint. Keep all credential/signing values out of chat, logs and Git. Set only the OAuth callback and webhook gateway entries to `verify_jwt=false`, using the reviewed per-function fragment; user POST actions still verify JWTs, and webhook POSTs require HMAC. Operations/rescheduling retain gateway JWT verification.

## Hosting and cost assessment — no provisioning

Fresh connected inventory: organization `wchsevschfwxxoyandhp`, plan Free/tier_free; two active projects, production `ufmhrmzumqkjvaezrmxf` and populated AI-test `yyevuwvtrktrzwuzeddo`. Neither may be changed or reused. [Current Free rules](https://supabase.com/pricing) limit active projects to two. **No eligible free slot is available in the observed organization.** No create, pause, transfer, upgrade, branch or add-on action was attempted.

The organization-aware tool returns only `{type:project,recurrence:monthly,amount:0}`. That generic Free base response is not an eligible-slot confirmation or a complete paid quote. The available connector does not expose an itemized organization upgrade/provisioning estimate, invoice/tax details, current compute sizes, add-ons or current usage headroom. A binding all-in incremental quote therefore remains unavailable; do not treat the following public pricing calculation as approval to spend.

Public USD pricing basis, checked November 17:

| Component | Billing unit / recurring basis |
| --- | --- |
| Pro organization | $25/month for the organization, not just the new project |
| Micro/Nano compute on paid organization | $0.01344 per project-hour; compute is billed in whole-hour units; approximately $10/project/month |
| Compute credit | $10 per organization per month; shared credit, not a separate credit for each project |
| Disk above included allocation | $0.125/GB/month above 8 GB/project |
| Uncached / cached egress | $0.09 / $0.03 per GB beyond the respective 250 GB allowances |
| Storage | $0.0213/GB/month above 100 GB |
| Auth MAU | $0.00325/MAU above 100,000/month |
| Edge invocations | $2/million beyond 2 million/month |
| Realtime, if enabled | $2.50/million messages beyond 5 million; $10/1,000 peak connections beyond 500 |

Required billable add-ons: **none** for a standard Supabase HTTPS callback. No custom domain, IPv4, PITR, replicas, drain, image transformation or advanced MFA is selected. Those optional products are excluded, not enabled for free. Taxes, currency conversion, plan proration and existing-project usage/size effects require the owner's billing estimate. Upgrading this organization also affects the two existing projects' billing and cannot be treated as a $10-only acceptance-project decision.

Under the explicit hypothetical assumption that all three projects run Micro/Nano for 730 billed hours, there are no add-ons/overages/taxes and the full $10 credit applies: `$25 + 3 × 730 × $0.01344 − $10 = $44.4336` (about $45/month). At 720 hours the same formula is $44.0304. The acceptance compute component alone is $9.8112 for 730 hours; the organization-wide incremental total from the present Free plan is the complete formula, not that component alone. Larger existing instances or usage increase the total. This is an estimate with disclosed assumptions, **not a complete account-specific quote**. Obtain the billing dashboard/provider's itemized estimate before seeking spending approval; no quote has been accepted.

Sources: [compute units/credits](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [billing usage categories](https://supabase.com/docs/guides/platform/billing-on-supabase), [egress rates](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [disk billing](https://supabase.com/docs/guides/platform/manage-your-usage/disk-size).

Local CLI/Docker and GitHub-hosted CI continue without a newly provisioned Supabase project. CI account runner allowances still apply; no paid runner product was enabled. These ephemeral localhost stacks cannot provide a stable public HTTPS callback. No tunnel or alternative host was provisioned. A tunnel/host choice needs its own availability, isolation and cost assessment.

## Deployment and owner record

No authorized isolated hosted backend exists, so no deployed handler version or exact redirect URI can be verified. The inspected Vercel frontend preview and its SSO-blocked callback-path result remain documented in the [prior deployment assessment](acceptance-setup-and-route-readiness-2026-11-17.md). Do not register that preview as the OAuth handler. A future canonical URI has the form `https://<approved-project-ref>.supabase.co/functions/v1/careerdev-calendly-oauth`; it remains a template.

| Registration/acceptance fact | Confirmed value |
| --- | --- |
| Owner-designated host identifier | Not provided |
| Owner-designated OAuth app name | Not provided |
| Registered redirect URI | Not provided / no backend available |
| Granted scopes | Not provided; required scope string above |
| Backend deployment URL | Not available |
| Deployed OAuth handler version | Not deployed |
| Host eligibility and remaining quota | Not verified against designated host |

Before registration/live acceptance: obtain an authorized isolated backend, deploy the pinned source/candidates there, record function version/commit and verify public callback reachability without Vercel SSO. Verify the acceptance frontend's actual backend/project target. Then record owner settings and compare the actual authorization request's redirect/scope plus token-exchange redirect. Verify host ownership, active solo unpaid instant event type, supported location, no unsupported required custom questions, webhook entitlement and current quota. Current documented limits include Free/Trial invitee create 5/user/day, Free general API 50/user/minute and OAuth tokens 8/user/minute; use [actual rate headers and designated plan](https://developer.calendly.com/api-docs/overview/rate-limits), not assumptions about the undesignated connected account.

## Evidence and remaining limits

Verified implementation head: `433fa250b36d4d63b7246c06309295f539780f5a`. [Application validation/typecheck/build](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/44042309860), [Deno boundary checks](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/44042309632) and all three [database rehearsal jobs](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/44042309501) passed. The local Node suite has 129 passing tests, including refresh contention, ambiguous refresh/create, subscription replay/crash recovery, revocation recovery, raw HMAC/replay rejection and minimized duplicate receipts. Source audit and diff checks pass.

The recovered full-schema CI at `433fa25` passed reconstruction, durable completion/replay, actual booking notification triggers, reschedule/cancellation, retained synthetic financial reference, inbox claim/lease/grants and pg_dump/restore. That is application-schema compatibility evidence with local managed-schema adapters, not a backup of the Supabase platform or a provider test. The separate local Supabase stack supplied real Auth and PostgREST: concurrent OAuth callbacks exchanged once, a lost confirmation response recovered through a signed webhook, duplicate delivery applied once without another provider create, cancellation retained the booking/transaction identity, concurrent refresh dispatched once, subscription ensure replay created once, and disconnect revoked both credentials and deleted their row. All provider responses were synthetic.

Against Calendly: **zero checks executed**. OAuth connect/callback, real token rotation/revocation, booking, hosted rescheduling, cancellation and actual signed webhook delivery/retries are pending the setup record above. No owner host/app is invented or inferred. No production/shared-test settings or real financial transactions changed.

Remaining release work includes actual provider contract/latency/quota checks, automatic scheduler/operational alerting policy, complex multi-hop reschedule/out-of-order resolution, meeting/join-link metadata acceptance, and broader billing/admin/non-Calendly regression scenarios beyond the synthetic transaction and pending-write guards. Ambiguous refresh or duplicate subscriptions explicitly requires owner review; do not erase locks or pending holds to make tests pass. Full production readiness is not established by these rehearsals.
