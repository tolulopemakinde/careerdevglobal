# Responsive dashboard navigation

## Verified destinations

The existing dashboard segments remain on their original pages. Each entry uses the dashboard path plus the fragment below. No new feature pages are exposed.

| Client (`/client-dashboard`) | Fragment |
| --- | --- |
| Overview | `#overview` |
| Profile | `#profile` |
| Bookings and payments | `#bookings` |
| Marketplace journey | `#journey` |

| Coach (`/coach-dashboard`) | Fragment |
| --- | --- |
| Overview | `#overview` |
| Earnings and payouts | `#earnings` |
| Profile | `#profile` |
| Credentials and verification | `#credentials` |
| Calendly | `#calendly` |
| Service offerings | `#services` |
| Publish Career Insight | `#insights` |
| Booking requests and upcoming sessions | `#bookings` |
| Add availability | `#availability` |
| Current availability | `#current-availability` |

The shared marketing header is retained. Its imperative navigation enhancement cannot supply dashboard segment navigation, so a separate reusable dashboard shell uses native fragment links. These retain mounted forms, support history, and avoid reloads. Desktop collapse uses an 80px rail; below 1024px the menu becomes a modal drawer. Labels, custom focus tooltips, focus trapping, background inertness, Escape/backdrop dismissal, focus return, and reduced motion are included.

## Access controls

Previously, these pages checked identity on the client and fetched data using Supabase RLS/RPC boundaries. New server layouts validate identity with `getUser()` and the existing `get_my_role` RPC, requiring the matching role and active status before rendering. Database, RPC, Edge Function, AI, payment, and Calendly implementations are unchanged. Sidebar visibility does not authorize access. The shell redirects to the appropriate existing login route on Supabase `SIGNED_OUT` events.

## Validation on 2026-10-28

- Standalone TypeScript check: passed.
- Navigation target validation: all 4 client and 10 coach links match existing segment IDs.
- Build input, authorization manifest, Phase 2 boundaries, Edge security, Phase 3 preview controls, Phase 4 simulation: passed.
- `git diff --check`: passed.
- Local Next production compilation: passed. Full build did not finish because the Windows runtime rejected a child process with `spawn EPERM` at the build TypeScript stage. Starting the dev server encountered the same restriction.
- No lint command or lint dependency exists in this repository.
- Existing source audit fails on Windows because its path exclusions use forward slashes while `path.relative` returns backslashes. All three flagged files are unchanged in this PR; no secret value was retrieved or printed.
- Local browser validation could not run: bundled Playwright has no installed browser; attempts to launch the installed browser did not provide a usable automation endpoint. A synthetic local Supabase fixture was prepared but no authenticated browser results are claimed.

## Preview review still required

Use synthetic accounts in an isolated preview backend. For client and coach independently, check widths 375, 768, 1024 and 1440px; no horizontal overflow; sidebar/content/FAB overlap; collapse and tooltip behavior; drawer focus on open; Tab/Shift+Tab wrap; Escape, backdrop and destination dismissal; focus return; reduced motion. Check every table entry above, direct fragment entry, refresh, back/forward and forms remaining mounted. Check anonymous login redirect, wrong role/inactive account rejection, sign-out/session-expiry behavior and a backend rejection after expiry. Exercise existing booking, profile, payments, earnings, availability, credentials, insights and Calendly workflows only against a suitable test backend.

No production release or merge is authorized by this PR.
