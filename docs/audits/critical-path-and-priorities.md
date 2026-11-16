# Critical path and priorities

Baseline: 16 November 2026. No item below authorizes merge, migration, provider spend or deployment. Production remains HOLD. Owners refer to the workstream, not an assignment sent to anyone.

| Order | Priority / owner | Concrete next result | Dependency | Completion evidence |
| --- | --- | --- | --- | --- |
| 1 | P0 schema / #36 | Provenanced schema-only export, RPC/grant/policy/trigger/storage/config inventory, migration mapping | Authorized private export path and disposable target | Rebuild, drift comparison, rollback with no production writes |
| 2 | P0 security / audit + #29 | Review Next patch; resolve coach-wide evidence access scope and privileged RPC grants | Intended coach-assignment policy | Synthetic two-client/two-coach negative tests, no private-row probing |
| 3 | P0 marketplace / #48 | Restore intended anonymous public projection and truthful error/empty states | Schema/ACL review | Anonymous directory returns approved fixture records; excludes private/unapproved fields and handles denied backend honestly |
| 4 | P0 booking / #48 contains #44 | Correct event columns; prove durable claims, idempotency, cancellation/rescheduling, meeting replacement | Representative schema and Calendly sandbox | Concurrent claims, uncertain outcomes, repeated moves, webhook recovery, role tests and linked transaction preservation |
| 5 | P0 billing / #42 | Reconcile code conflicts and complete paid entitlement lifecycle | Same schema and booking transaction contract; policy approvals | TEST owner browser callback, W08/W10/W12/W16, duplicate/out-of-order events, credits, adjustment/dispute cases |
| 6 | P0 pilot acceptance | Visitor → client/profile → recommendation → coach → booking/payment → service; coach/admin equivalent | Approved synthetic sessions and provider TEST scope | Traceable matrix with exact frontend/backend/schema versions and actual PASS per completed flow |
| 7 | P1 auth / #47 | Role-specific dashboard logout and session expiry | Synthetic account/session access | Client+coach success/failure/expired-session and mobile keyboard tests |
| 8 | P1 AI / #39 + #35/#34 | Selected agent/intake positive flows with evidence grounding and review | Credit and tenancy contract from #42, schema from #36 | 11-agent pilot scope agreed; LinkedIn evidence isolation and persistence, safe failures |
| 9 | P1 providers / existing #43 tooling | Controlled OpenAI/Groq capability/model/quality/budget evaluation | Dedicated bounded test configuration, owner spend scope | No silent fallback on quota/permanent failure; output validation, credit accounting, audit/rollback |
| 10 | P1 public quality / audit + #10 | Help search, skip navigation, response headers, contrast/responsive fixes | Existing integrations preserved | Build/type/security checks and browser/device results |
| 11 | P2 growth | Onboarding, SEO/domain, education, analytics, CRM automations | Reliable pilot and explicit automation scope | Measured activation, delivery and support outcomes |

## Work safely completed in this audit

- Audit branch based on verified main: six reports plus sanitized evidence; Help Center filtering/status/no-match behavior; focusable skip destination; exact Next.js 16.4.6 security patch and npm lockfile.
- Existing #48 continuation: scanner allows only a server-side environment lookup in the exact local runner. Regression tests retain literal/client/arbitrary-test rejection. Scheduling test command now includes operation, reschedule, scanner and public-directory boundary tests (93 pass). The directory UI distinguishes backend failure from genuine empty inventory without changing database access.
- Read-only diagnosis proves public inventory exists and access is denied; no new coach listings, grants, database state, prices, billing policies or provider configuration were changed.
- Local PostgreSQL16 partial contract rehearsal passes. This does not reconstruct all 243 production tables or replace a full Supabase/RLS/provider rehearsal.

## What remains blocked and exact missing access/evidence

- Approved disposable production-shaped schema target/export with provenance; current AI test project is populated and not blanket-authorized for writes.
- Approved synthetic client, approved coach, staff/admin sessions supplied through a secure sign-in path; no passwords or tokens should be pasted into reports/chat.
- Calendly sandbox OAuth application/coach connection, permitted scopes/plan, hosted reschedule and webhook evidence. One production connection does not authorize creating real appointments.
- Paystack remaining TEST scenario plan, checkout-owner browser session, renewal/late-event/expiry/dispute evidence and separate approval for any new transaction. The previous one-off payment authorization is closed.
- AI inference keys/budgets and narrowly approved synthetic provider evaluation; no keys retrieved or paid requests sent.
- Custom-domain relationship/DNS ownership; read access to Brevo currently fails; Sentry alert/DSN evidence and backup/PITR/restore evidence are missing.

## Integration controls

Do not merge #44 and #48 independently. Preserve #34 inside #35/#36. Resolve #39/#42 webhook/runtime conflicts explicitly; preserve claim/settle in TEST and reduced-dependency fallbacks. Production-shaped migration rehearsal must include deployed Edge/RPC contracts, not just frontend compilation. A dependency patch landing in this audit branch must be reconciled into #42 package resolution; never resolve lockfiles by taking the older branch wholesale.

No remote push was performed because connected Git pushes can automatically create Vercel deployments. Local commits are reviewable without crossing the separate deployment authorization boundary.
