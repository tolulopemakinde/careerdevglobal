# CareerDev Global Deployment Verification

**Verification date:** 2026-10-11 (WAT)
**Scope:** Read-only production website, Vercel deployments, GitHub branches/PRs, and Supabase Edge Functions
**Production mutation:** None

## Executive result

The public production website is rendering successfully, but **Phases 1–4 are not deployed end-to-end to production**.

All four phases have successful Vercel preview deployments. The production Vercel deployment remains on `main` at commit `107af72`. Supabase still runs the pre-hardening coach-matching Edge Function version 13. Therefore the Phase 2 server hardening, Phase 3 distributed controls, and Phase 4 operational validation are repository/preview artifacts, not live production controls.

## Evidence table

| Area | Verified result | Status |
|---|---|---|
| Production homepage | HTTP 200; CareerDev Global content renders | Healthy public rendering |
| Production Career Intelligence | HTTP 200; intake, document limits, human-review messaging, and AI governance content render | Healthy public rendering |
| Production Coach Matching | HTTP 200; matching explanation and human-choice messaging render | Healthy public rendering, live backend boundary still old |
| Vercel Phase 1 preview | READY; commit `77b2ae5` | Preview only |
| Vercel Phase 2 preview | READY; latest commit `11ab6b1` | Preview only |
| Vercel Phase 3 preview | READY; commit `3675548` | Preview only |
| Vercel Phase 4 preview | READY; commit `634b3e4` | Preview only |
| Vercel production | READY; target `production`; `main` commit `107af72` | Production does not include Phases 1–4 |
| Supabase coach matching | ACTIVE version 13, `verify_jwt=false`, SHA `ff0c0d...0354` | Pre-Phase-2 implementation |
| Supabase AI runtime | ACTIVE version 23, JWT verification enabled | Not proven to include Phase 1–4 repository changes |
| GitHub PRs | PRs #12, #13, #14, and #15 remain open | No merge-to-main evidence |
| Preview accessibility | Phase 4 Vercel preview returns Vercel SSO login to unauthenticated fetches | Preview requires authenticated inspection |

## Confirmed live coach-matching gap

The deployed Supabase coach-matching function still contains:

- wildcard `Access-Control-Allow-Origin: *`;
- unbounded `req.json()` parsing;
- silent filtering of malformed signals;
- raw provider/database error details in public responses;
- no distributed limiter; and
- no Phase 3 shared-quota RPC calls.

The hardened handler exists in the repository and has a successful Vercel preview build, but it has not been deployed to Supabase.

## Public-site observation

The production HTML responses include `Access-Control-Allow-Origin: *`. No matching wildcard was found in the repository's Next.js configuration; the header appears to be platform/deployment behavior rather than the Phase 2 Edge Function handler. This is a low-priority platform-hardening observation for explicit verification, not evidence of an application data leak by itself.

## Safe fix applied in this tranche

The repository now contains this evidence artifact and an explicit status distinction in the Phase 4 documentation. No production deployment, migration, function update, merge, authentication change, or Vercel setting change was performed.

## Required next action

Owner review is required before merging the phase PR chain and deploying the Supabase handler. The exact production change would include the approved commit chain, Supabase function deployment, service-only quota RPC migration in an isolated/approved environment, environment-variable configuration, smoke tests, monitoring, and rollback plan.
