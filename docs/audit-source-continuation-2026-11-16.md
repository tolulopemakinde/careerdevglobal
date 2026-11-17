# PR #48 continuation — 16 November 2026

Base: `0af7e6ac483a66c68b63e084f036c94ec1ecd29a`; local branch `audit/calendly-source-audit-2026-11-16`.

The latest remote Phase 1 validation (`43317641399`) fails because the source scanner treats a server-side environment lookup in `tests/calendly-local-supabase.mjs` as a literal credential. The database rehearsal (`43317641371`) succeeds independently. No real credential was recovered or printed.

The scanner correction strips only the exact environment lookup in that exact server-only runner. Literal assignments, arbitrary test files and client code still fail; regression tests exercise these rejection boundaries. The scanner is not disabled or broadly bypassed.

The same continuation fixes a confirmed public-journey defect: directory permission/transport errors were returned as an empty array. A typed public-read helper distinguishes unavailable responses from valid empty inventory. Coach/service pages show a generic unavailable message with no raw backend diagnostics. Optional Calendly link failures no longer hide otherwise retrieved service records; existing safe-URL filtering and booking safeguards remain. No RPC grants, profiles or offerings were modified.

Verification: 93 scheduling/operation/reschedule/source-audit/directory tests passed; source audit, TypeScript, Phase 4 checks and optimized build passed locally. A network-disabled, ephemeral PostgreSQL16 contract fixture passed concurrent claim/replay, booking event compatibility, overlaps, transaction retention, rescheduling and cancellation checks. It was stopped afterward. Public-directory fixture RPCs are stubs; this is not a full production-schema/public-projection privacy rehearsal or a live provider test.

Local browser acceptance against a deliberately invalid backend verifies unavailable messaging. This is failure-path acceptance only, not restored marketplace availability. Full local Supabase Auth was not rerun; remote database-rehearsal CI is separately recorded evidence. Real Calendly sandbox, full schema/rollback, meeting replacement, multiple moves/webhook recovery, confirmation/cancellation cutover, authorization and payment regressions remain release gates.

No remote push, CI rerun, merge, deployment, live provider action, production/shared-test database modification or billing policy/gate change occurred. Reconcile the main audit branch's Next.js 16.4.6 security patch when updating this older branch; this continuation does not claim to patch production dependencies.


## Phase 1 matching continuation

Restricted matching RPCs remain unavailable to anonymous callers. The Edge candidate uses server authorization after validated bounded input; its public coach projection and quota/origin checks remain intact. This accompanies the local-only #36 SQL candidate for verified status, vector operator resolution and approved onboarding rules. Three source-boundary tests pass; they do not prove Deno compilation, embedding provider execution or authenticated browser acceptance. No Edge function or SQL was deployed. The combined scheduling script now runs these three guards alongside the prior 93 tests.

## Continued acceptance — real managed fixture and Deno

The #36 continuation now passes all 17 SQL acceptance checks and 22 semantic invalidation/publication guards, including after synthetic restore. Its real local Supabase CI reconstructs the recovered application schema and passes 33 Auth/PostgREST/Storage checks with six genuine synthetic password logins. This is separate from #48's smaller rescheduling fixture; no production or populated AI-test setting was touched.

Matching now passes standalone Deno 2.9.8 checking with a committed dependency lock and pinned SDK import. Correct the shared RPC type to PromiseLike (PostgREST builders are thenable) and accept string request IDs explicitly. Declare the documented native AI session boundary with unknown output and validate exactly 384 finite numeric elements before querying or scoring. Three embedding boundary tests and all 96 scheduling/security tests pass locally. The new pinned Deno workflow verifies compilation and those boundary cases; it does not execute a real embedding model or Calendly/Paystack operation. No function was deployed.
