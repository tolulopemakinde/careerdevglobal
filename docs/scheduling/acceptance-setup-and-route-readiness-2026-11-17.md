# Calendly acceptance setup and route readiness — 17 November 2026

**Live acceptance remains pending; PR #48 remains draft.** Implementation reviewed: `9fdee62eed571373e13fda78be6927c60a3f64d9`. No hosted functions, production settings, payments or Calendly appointments were changed. All provider responses in the executed tests were synthetic.

## Source and deployment evidence

The OAuth handler was recovered from PR #38's `codex/calendly-security-hardening` branch, commit `b3cae921d47fc33dd37e699f150df8d353a4f73a`, path `supabase/functions/careerdev-calendly-oauth/index.ts`. The recovered raw file SHA256 is `8ef7e0c5bd84cf7c07c1d752378cd6dc5bc865a48afd2734e5a933e8c7e6f8ab`. The historical November 16 inventory lists production OAuth function v11; that is historical evidence, not a newly inspected or acceptance-deployed version. The guarded adaptation and durable adapter are in `c6a29f210bc70af889247d85a26eace95f9b32b9`; the typed frontend boundary is in the reviewed head above.

Related Calendly branches/PRs #37, #38 and #44 were inspected. No Calendly webhook receiver or subscription create/list/delete/persist/cleanup lifecycle was found. Paystack webhook work does not implement Calendly handling.

The inspected READY frontend preview is deployment `dpl_FztbPfwGsVm2jsJkJyexGwkyWTVy` at `https://careerdevglobal-pw5sidjwv-career-dev-global.vercel.app` (commit `b5b817e1424ca70775da3b3d959c94ea125c9e6d`). Its branch alias is `https://careerdevglobal-git-codex-calendly-bac-cf0553-career-dev-global.vercel.app`. The callback-path probe returned HTTP 302 to `https://vercel.com/sso-api` (query omitted). The Next application has no OAuth API route: Supabase Deno sources are not automatically served by this Vercel deployment. READY does not establish an accessible OAuth handler or isolated backend.

Fresh Supabase inventory contains only the protected production and populated AI-test projects. Neither is eligible for this work. Organization `wchsevschfwxxoyandhp` is Free with two active projects; the prior creation attempt hit the free-project limit. A fresh generic project quote returned $0/month base, but did not establish an available free slot or quote an upgrade, compute, usage and add-ons together. No eligible zero-cost cloud target or exact paid incremental quote is verified. No project, upgrade or add-on was provisioned. Local CLI/CI acceptance avoids a new hosted-project charge, but its ephemeral localhost endpoint cannot provide the requested stable public HTTPS callback. Any tunnel/alternative hosting needs a separate isolation, access and cost assessment before provisioning.

**Exact redirect URI to register: unavailable until an approved isolated backend exists and its public handler is verified.** The canonical template is `https://<approved-disposable-project-ref>.supabase.co/functions/v1/careerdev-calendly-oauth`; this is a template, not a registration instruction. Do not register the frontend preview URL as this handler's callback.

## Implemented acceptance path

With the explicit disposable-project frontend flag enabled, coach confirmation/cancellation follows dashboard → guarded frontend helper → `careerdev-calendly-operations` → JWT-derived actor and service-only operation claim → provider request → receipt and durable finish. The existing durable operation module/RPCs are reused. Uncertain operations require reconciliation; the browser never falls back to legacy writes. Confirmation and cancellation remain disabled on both protected project references. An absent flag preserves existing legacy behavior; this is not a production cutover.

The recovered OAuth adapter now requires explicit isolated target, HTTPS origin/callback, app and host configuration. It checks current active approved coach identity, S256 PKCE and atomically consumes expiring state before token exchange. It checks returned scopes and exact designated host, encrypts credentials server-side, projects safe status/event-type fields, and avoids production redirect defaults. The public callback alone needs gateway JWT verification disabled; POST actions verify user authentication inside the handler. Operations retain gateway JWT verification. The unapplied per-function fragment is `docs/scheduling/rehearsal/function-config.toml`.

Remaining implementation: Calendly webhook signature/replay receiver and durable inbox, subscription lifecycle/cleanup, token refresh and provider revocation, scheduled recovery, and full-schema notification/meeting metadata/billing/admin/legacy-write compatibility. Disconnect currently deactivates the local connection only. Rescheduling uses the existing invitee-hosted flow and GET-only reconciliation; it does not invent a direct move API. These gaps preclude production release and live webhook acceptance.

## Short owner/setup checklist

1. Provide the designated nonproduction host identifier and OAuth app name. Verify app Sandbox/nonproduction designation and ownership. Do not use the connected account by assumption.
2. Approve an isolated public backend only after a capacity/cost assessment. Deploy the reviewed handlers and candidate schema there, verify isolation and public callback, then register the exact canonical URI and record the deployed version.
3. Actual OAuth request requires `users:read event_types:read scheduled_events:write`. Scheduled-event write includes read. The current code does not request webhook management. Add `webhooks:write` plus the relevant event-family read coverage only when subscription implementation and tests exist. `availability:read` is needed if busy-time/user-schedule operations are added; event-type available times use `event_types:read`.
4. Verify the designated host's actual plan, event-type eligibility, API/webhook entitlement and remaining quotas. Current provider documentation permits Free invitee creation and ordinary webhooks, subject to limits: Free/Trial invitee creation 5 requests/user/day, Free general API 50 requests/user/minute, OAuth tokens 8 requests/user/minute. Do not infer available quota or host eligibility from the plan name. Pace synthetic tests and account for cancellations/rescheduling notifications.
5. In the **new isolated Supabase Edge Functions secret configuration**, configure `CAREERDEV_CALENDLY_ACCEPTANCE_ENABLED`, `CALENDLY_ACCEPTANCE_PROJECT_REF`, `CAREERDEV_APP_URL`, `CALENDLY_ACCEPTANCE_HOST_URI`, `CALENDLY_ACCEPTANCE_APP_NAME`, `CALENDLY_REDIRECT_URI`, `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`, `CALENDLY_TOKEN_ENCRYPTION_KEY`, and synthetic-only `CALENDLY_ACCEPTANCE_PARTICIPANT_EMAILS`. Use that project's platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not copy protected-project credentials. Rescheduling additionally uses `CALENDLY_RESCHEDULE_REHEARSAL_PROJECT_REF` and `CALENDLY_RESCHEDULE_REHEARSAL_ORIGIN`. Keep values out of chat, logs and Git.
6. Configure the branch-specific Vercel Preview build with the isolated `NEXT_PUBLIC_SUPABASE_URL` and its public client key, `NEXT_PUBLIC_CALENDLY_OPERATIONS_REHEARSAL_PROJECT_REF` and, for rescheduling, `NEXT_PUBLIC_CALENDLY_RESCHEDULE_REHEARSAL_PROJECT_REF`. Public flags must match the isolated backend. Never enable these against protected projects. Compare actual authorization request redirect/scope and token-exchange redirect with the owner record before following OAuth.

## Owner confirmation record

| Field | Verified value |
| --- | --- |
| Nonproduction host identifier | Pending owner designation |
| OAuth application name | Pending owner designation |
| Registered redirect URI | Pending backend and owner portal confirmation |
| Granted scopes | Pending owner portal confirmation and actual token grant comparison |
| Acceptance deployment URL | No isolated public backend verified |
| Deployed OAuth handler version | Not deployed; source version `9fdee62eed571373e13fda78be6927c60a3f64d9` |

## Executed checks and limits

- 115 Node scheduling tests passed locally: scope/target guards, OAuth PKCE and atomic state, host/grant mismatch, safe projections, claim-before-provider, confirmation/cancellation replay, uncertain no-retry and frontend no-fallback behavior.
- Reviewed-head GitHub Actions passed: [Deno boundary checks](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/44038077305), [application validation/typecheck/build](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/44038077450), [database/Auth rehearsal](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/44038077348).
- The database rehearsal uses real local Supabase Auth/PostgREST and synthetic SQL records. Concurrent callbacks exchange once; duplicate confirmation dispatches one mocked provider create; cancellation dispatches once; marketplace booking and synthetic transaction references survive. Reduced fixtures do not validate all production triggers/consumers.
- Against Calendly: **none executed**. Connect/callback, actual booking, hosted rescheduling, cancellation, provider webhook delivery/recovery and reference preservation remain pending designated host/app, backend, configured credentials and the missing lifecycle implementation. No secrets are requested in chat.

Next: resolve isolated hosting/cost without touching protected projects, receive the owner record, configure/deploy only that target, verify actual redirect/scopes, then run paced synthetic core-flow acceptance. Implement and rehearse the missing webhook lifecycle before claiming webhook acceptance or production readiness.
