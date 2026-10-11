# Phase 2 — Safe AI Infrastructure Enhancements

**Status:** In progress  
**Operating boundary:** Safe repository implementation only. No production deployment, Supabase mutation, RLS/grant change, authentication change, billing action, or Edge Function update.

## Implemented in this tranche

### Public coach-matching client hardening

The browser client now enforces the same visible input bounds identified in the deployed function review:

- Goal input is limited to 4,000 characters.
- Signals are capped at 10 before submission.
- The payload is normalized before invoking the function.
- Raw invocation, RPC, provider, and exception details are not shown to public users.
- The UI returns a stable recovery message and preserves the browse-available-coaches path.
- A character counter and native `maxLength` make the bound visible and accessible.

These controls reduce client-side leakage and unnecessary oversized requests. They do not replace server-side validation, rate limiting, or Edge Function changes.

### Verification gate

`validate:phase2-boundaries` checks that the client controls remain present and rejects regressions that render raw exception messages or backend detail fields. CI runs this check alongside the Phase 1 source, type, input, and build checks.

## Deferred changes requiring preview and owner review

The deployed AI runtime human-review persistence gap cannot be safely fixed from the web repository because the deployed Edge Function source is not tracked here. The correct remediation requires a separately reviewed Edge Function/database change that preserves `human_review_required` as an immutable execution invariant and tests it in an isolated Supabase project.

The public coach-matching rate/concurrency budget, server-side error redaction, authenticated CORS policy, and Paystack payload-retention policy likewise remain backend/deployment work. They are documented in the Phase 1 Edge Function review and remain unmodified.

## Verification status

- Local Phase 2 boundary validator: pending final branch verification.
- TypeScript check: required before commit.
- Production build: required before commit.
- CI: required after push.
- Production behavior: not changed or claimed.
