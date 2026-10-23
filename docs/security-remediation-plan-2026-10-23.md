# CareerDev Global — Security Remediation Plan
**Audit date:** 2026-10-23  
**Scope:** Production Supabase project `ufmhrmzumqkjvaezrmxf`, repository `tolulopemakinde/careerdevglobal`.  
**Provider decision:** OpenAI remains the only planned AI provider. Do not introduce Groq or Jina.

## Safety boundary
This branch documents findings and an ordered remediation gate. It does not change production data, grants, policies, Auth settings, Edge Function deployments, secrets, or Vercel configuration. Apply each remediation only after inspecting the exact function/table behavior, testing in a representative isolated environment, and confirming rollback steps. The existing AI test project `yyevuwvtrktrzwuzeddo` is active but has no recorded migrations and is not yet a representative test environment.

## Verified live findings
1. Supabase security advisor reports 51 `SECURITY DEFINER` functions executable by `authenticated`. This is a review queue, not proof every function is vulnerable.
2. Advisor reports 16 public-schema tables with RLS enabled and no policies. Some may intentionally be server-only; inspect service-role usage and API exposure before changes.
3. Supabase Auth leaked-password protection is disabled.
4. Edge Function inventory reports `careerdev-coach-matching` active at version 16 with `verify_jwt=false`.
5. Inspection of the deployed coach-matching source shows explicit POST-only handling, origin allowlisting, body-size/input validation, distributed rate limiting and shared quota checks when enabled, public candidate/match RPC calls, and generic error responses. It is designed as a public matching endpoint; blindly enabling JWT verification could break its intended unauthenticated use. Verify the RPC grants, rate-limit configuration, origin list, and actual endpoint exposure before deciding whether to retain public access or require authentication.
6. AI runtime version 24 previously inspected has areas requiring targeted tests: execution ownership consistency, ignored state-transition errors, credit reservation before all preconditions are verified, malformed output/JSON failure paths, and the direct-completion path potentially bypassing the expected quality/human-review gates. The approval request row must be created consistently with any transition to human review.
7. The test project currently reports zero recorded migrations and zero development branches. It is not ready to validate production schema-dependent changes.

## Remediation order and acceptance criteria

### P0 — Establish a reliable, isolated verification environment
- Pull and archive the current production schema and migration history; do not apply a schema dump to production.
- Establish a representative non-production project with schema/migrations and synthetic data, or provision a database branch if available and affordable.
- Verify repository migration history against live Supabase migration records before adding new migrations.
- Acceptance: clean setup succeeds from version-controlled migrations; schema comparison reviewed; rollback plan recorded.

### P1 — Edge Function authentication and abuse controls
- Review all active Edge Functions with `verify_jwt=false`, grouping intentionally public endpoints (public webhooks/OAuth callbacks/public matching) separately from user-facing authenticated APIs.
- For coach matching, verify the handler's distributed rate-limit RPCs and shared quota are fail-closed, the service-role secret exists, public RPCs return only approved public coach fields, and origin allowlisting includes the actual production origin(s).
- Do not treat CORS as authentication. Confirm whether the function is intended to be public; if so, retain JWT-off only with documented public contract, rate limits, quotas, and abuse monitoring. Otherwise require JWT and derive user identity server-side.
- Acceptance: unauthenticated requests to private endpoints fail; intentionally public endpoints pass bounded abuse tests; no private fields are returned; rate-limit outages fail closed.

### P1 — Review SECURITY DEFINER functions
- Export definitions, owner, grants, search_path, and call sites for the 51 flagged functions.
- Prioritize admin role activation, payment/payout/refund, subscription/credit ledger, AI execution/approval, profile and coach data access.
- For each function, confirm authorization inside the function (not only in the UI), validate caller ownership/role, pin a safe search_path, and grant EXECUTE only to required roles.
- Do not bulk revoke EXECUTE or switch functions to SECURITY INVOKER without checking application dependencies.
- Acceptance: positive and negative tests for anon, authenticated ordinary user, coach, staff/admin, and service role as applicable; no cross-user access or privilege escalation.

### P1 — Review the 16 RLS-enabled/no-policy tables
- Determine data sensitivity, expected API access, service-role consumers, and whether each table should be inaccessible to anon/authenticated users.
- For internal-only tables, verify API grants and server-side-only access. For user-facing tables, add least-privilege policies derived from actual ownership/role rules.
- Acceptance: test each table as anon, normal authenticated user, coach, staff/admin, and service role; verify no unauthorized reads/writes and no breakage of required workflows.

### P1 — AI runtime governance, credits, and failure handling
- Ensure request ownership/role checks happen before credit reservation and provider calls.
- Check every state transition and surface safe, non-sensitive diagnostics without leaking raw provider errors or user content.
- Validate configuration/snapshots before reserving credits; handle malformed model output and exceptions with deterministic credit release/settlement.
- Enforce quality and human-review gates for all relevant completion paths; atomically create/refresh the human approval request when entering review. Confirm the transition RPC's approved-request invariant.
- Add bounded timeout/retry behavior, idempotency, and tests for provider failure, malformed output, insufficient credits, duplicate requests, failed transitions, and approval denial.
- Keep OpenAI as the only planned provider; never add Groq/Jina.

### P2 — Auth and release verification
- Review Supabase Auth settings and enable leaked-password protection after confirming the project supports the intended sign-in flows.
- Add automated checks for Edge Function JWT settings, migration drift, database grants/RLS, AI governance transitions, and required environment variables without printing secrets.
- Verify production domain/origin allowlists, error monitoring, and rollback instructions before release.

## Required release gate
No production deployment or database migration until: (1) source and schema are reviewed, (2) isolated tests pass, (3) security regression tests pass, (4) human approval workflow is verified, (5) rollback plan is ready, and (6) the user approves the production release step.
