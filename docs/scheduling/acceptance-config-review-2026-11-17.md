# Calendly acceptance configuration review — 17 November 2026

**Decision: live acceptance PENDING. Keep #48 draft.** Reviewed implementation head: `8a776246f2a7eeb9b9db5b86b0c21e5dc4623c3a`. All four purported owner settings are literal `[fill in]` placeholders; none is a confirmed value. No connected Calendly account was used as an acceptance host. No production app/callback/settings were queried or changed; no OAuth connection, appointment, subscription, payment, deployment or merge was performed.

## Owner settings and deployment comparison

| Required setting | Owner-confirmed value | Verification result |
| --- | --- | --- |
| Nonproduction host identifier | Not provided | Cannot identify or verify a designated host, its ownership, plan, event types or remaining quota |
| OAuth application name | Not provided | Cannot identify the nonproduction app or confirm Sandbox designation |
| Exact registered redirect URI | Not provided | Cannot compare against the actual acceptance authorization request or token exchange |
| Granted scopes | Not provided | Cannot compare actual grants against requested scopes and endpoint requirements |

Also missing: the acceptance deployment URL, backend project reference, deployed OAuth handler source/version and browser origin. The build-only PR preview and the connected Basic/Free account are not owner-designated acceptance environments. The reschedule entrypoint explicitly rejects both protected existing Supabase projects and requires a different exact hosted-project URL/reference. Local tests exercise the handler directly and do not prove this entrypoint is enabled on an acceptance deployment.

### OAuth implementation evidence and its limits

#48 calls `careerdev-calendly-oauth` from `app/coach-dashboard/calendly-panel.tsx` but does **not** contain that function's implementation. Accordingly, the actual acceptance OAuth request cannot be verified from this PR. No acceptance authorization URL was generated or followed.

An existing **historical local source reference** from the earlier audit, not a verified acceptance deployment, derives the redirect from `CALENDLY_REDIRECT_URI` with a backend-URL `/functions/v1/careerdev-calendly-oauth` fallback and requests:

```text
users:read event_types:read scheduled_events:write
```

It uses the same redirect variable for authorization and code exchange. This identifies what must be checked if that implementation is adopted; it is not evidence of the registered app or the value an acceptance deployment currently sends. No production URL or application setting is substituted for the missing acceptance values, and no historical OAuth source is copied into the PR.

For acceptance, configure an explicit nonproduction `CALENDLY_REDIRECT_URI`. Obtain the designated handler's reviewed source/deployment identity, then compare only the decoded `redirect_uri` and requested scope names with the owner-confirmed registration. The redirect string must match in the authorization request, token exchange and portal registration, including scheme, port, path, query and trailing slash. Do not log authorization URLs containing state/code, token responses, encrypted connection rows or secrets. Require PKCE S256, bounded/coach-bound state and callback replay/expiry tests. These checks cannot currently be marked PASS.

## Current scope and plan rules

These are provider documentation findings as of this review, not verified grants or entitlements for an unidentified host.

| Operation exercised by the implementation/test plan | Required permission / distinction |
| --- | --- |
| Resolve connected user | `users:read` |
| List/read event types; `GET /event_type_available_times` | `event_types:read` |
| Confirm through `POST /invitees`; cancel through event cancellation POST | `scheduled_events:write` |
| Read event/invitee details; hosted reschedule linkage and reconciliation GETs | `scheduled_events:read`, also covered by `scheduled_events:write` |
| Create/delete and inspect webhook subscriptions for invitee-created/canceled events | `webhooks:write` (includes webhook reads), plus scheduled-event read access for the event family |
| User busy times or user/event-type availability schedules, if added to the plan | `availability:read`; not necessary merely for event-type available-times retrieval |

Calendly's current scope catalog says write includes read within the same domain. Therefore the historical request's `scheduled_events:write` is **not** missing scheduled-event reads merely because a separate `scheduled_events:read` string is absent. This corrects earlier audit uncertainty. Actual granted scopes still require verification; requested and granted scopes are different evidence.

The historical request does not request `webhooks:write`. If the acceptance app is to create/manage subscriptions, that request/grant must be reconciled. A receiver using an owner-preconfigured subscription instead still needs a verified subscription identity, event family, signing configuration and authorized setup evidence; subscription management scope is not needed merely to verify a received signature. #48 currently includes no Calendly webhook receiver or subscription setup implementation.

The 3 November 2026 provider release makes `POST /invitees` and ordinary scheduling webhooks available on **Free** as well as paid plans. Free/Trial invitee creation is limited to five requests per user per day; Free general API access is limited to 50 requests per user per minute. Free status alone does not require an upgrade or prove incompatibility. The designated host's actual plan, event-type eligibility, remaining quota and endpoint responses remain UNVERIFIED. No upgrade or paid add-on is proposed or authorized.

Sources:

- [Authorization scopes](https://developer.calendly.com/docs/authentication/scopes)
- [3 November plan availability change](https://developer.calendly.com/release-notes/2026/11/3)
- [Current rate limits](https://developer.calendly.com/api-docs/overview/rate-limits)
- [OAuth registration, redirect and PKCE rules](https://developer.calendly.com/docs/authentication/creating-an-oauth-app)

## Test results and evidence

Fresh local checks: `npm run test:scheduling` — **96 passed, zero failed**; `npm run audit:source` — PASS. This is the scheduling/security/directory/matching-boundary suite, not 96 live Calendly tests. No provider credentials are used by these Node tests.

Recorded exact-head CI (not newly rerun by this review): [application validation](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/43963502550) and [PostgreSQL/local Supabase Auth rehearsal](https://github.com/tolulopemakinde/careerdevglobal/actions/runs/43963502661) pass at the reviewed head. The local Auth rehearsal uses synthetic Calendly responses and a reduced schema. It does not authorize or prove live acceptance.

| Requested acceptance check | Available result/evidence | Live result / remaining condition |
| --- | --- | --- |
| OAuth connect and callback | Frontend invocation reviewed; OAuth handler absent from #48; historical reference only | NOT RUN: all four settings, acceptance deployment/source and credential presence unverified |
| Booking confirmation | Local operation tests cover claim-before-POST, provider ownership/availability, duplicate dispatch, uncertain outcomes and persistence failure | NOT RUN: host/app configuration missing; durable confirmation module not connected to the coach UI/Edge route |
| Rescheduling | Local operation/HTTP tests pass for hosted URL, actor authorization, token handling, immediate old/new invitee evidence and overlap/replay denial; recorded Auth CI checks actual JWT/DB effects with synthetic provider responses | NOT RUN: no designated host/current booking; wrapper configuration unverified; genuine hosted move and replacement meeting details pending |
| Cancellation | Local operation tests cover read-before-cancel, already-canceled handling and uncertain outcomes | NOT RUN: configuration and durable route cutover missing; no cancellation notification triggered |
| Webhook handling | No Calendly receiver/signature/subscription implementation in #48; runbook explicitly lists webhook or scheduled reconciliation as future work | NOT RUN / IMPLEMENTATION GAP: signed receive, replay/duplicate denial, out-of-order delivery and recovery need implementation and a designated endpoint |
| Recovery / reconciliation | Local module tests retain unresolved holds, validate provider identifiers/tracking and reconcile bounded outcomes | NOT RUN live: no authorized provider receipts; no exposed durable reconciliation route; multiple hosted moves and webhook recovery remain open |
| Marketplace booking reference | SQL/local tests retain booking linkage; recorded Auth fixture asserts unchanged marketplace transaction after reschedule (`tests/calendly-local-supabase.mjs:120`) | Synthetic evidence PASS; live original booking ID, provider tracking→operation→booking mapping and transaction identity still need verification |

### Implementation gaps independent of the four settings

1. `runCalendlyOperation` and `reconcileCalendlyOperation` are imported by tests, not bound to a confirmation/cancellation Edge entrypoint. `app/coach-dashboard/page.tsx:25` still invokes the legacy `careerdev-calendly-booking` handler, then separately calls confirmation/cancellation RPCs. Correct configuration alone will not establish the durable flow.
2. The reschedule candidate is bound to an entrypoint, but it requires a designated disposable project, exact origin and dedicated encryption key. Expired connections return a reconnect response; the acceptance plan must verify this boundary.
3. There is no checked-in OAuth handler or Calendly webhook receiver in #48. Their absence is a repository finding, not a claim about an unidentified deployment. Obtain/reconcile the acceptance implementations before exercising them.
4. The existing fixture omits deployed notification/billing triggers. Prior #36 recovered-schema evidence is separate; remaining scheduling changes still require their own full-schema and provider acceptance.

## Access and configuration needed next

Provide the four **nonsecret** owner settings, the acceptance deployment URL/project reference/origin and reviewed OAuth source/deployment identity. Verify the designated host's plan and a single-host, coach-owned, instant, unpaid event type with supported location and no required custom answers. Use owner-authorized synthetic participant addresses; isolate invitation/cancellation notifications from real customers.

In the acceptance environment's secret manager, configure/verify presence of `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` and a dedicated `CALENDLY_TOKEN_ENCRYPTION_KEY`; configure a webhook verification/signing key under the name required by the eventual receiver. Their presence has not been inspected because no acceptance target is designated. Do not supply their values in chat, logs, commits or this report. `CALENDLY_REDIRECT_URI`, the reschedule project/origin guards and the frontend rehearsal project reference must match the reviewed nonproduction target. Do not reuse production credentials or callbacks.

Once those gates and implementation gaps are resolved, run the approved nonproduction sequence: verify redirect/scopes/host → OAuth success and failure/replay cases → exactly one bounded booking confirmation → authorized hosted reschedule → checked cancellation → signed webhook/replay/out-of-order recovery → reconcile uncertain outcomes while retaining original booking/transaction references. Respect the host quota and never blindly retry a possibly successful create. Do not substitute cancel-and-rebook for the hosted reschedule flow without separate explicit authorization.

Live acceptance remains pending until actual results support it. PR #48 stays draft; no production change, merge, real payment, new infrastructure spending or use of the undesignated connected account is authorized by this review.
