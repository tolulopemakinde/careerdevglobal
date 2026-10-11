# Phase 1 Release Checklist

This checklist is for a future reviewed change. It does not authorize production deployment.

## Before opening a pull request

- [ ] Branch contains only Phase 1 changes.
- [ ] No Supabase SQL, migrations, Auth changes, billing changes, or production secrets are included.
- [ ] `npm ci` succeeds from the committed lockfile.
- [ ] `npm run verify:phase1` succeeds.
- [ ] `npm run build` succeeds locally, or the exact environmental blocker is recorded.
- [ ] `git diff --check` succeeds.
- [ ] Source audit output contains no server-only secrets.
- [ ] AI execution policy has been reviewed by the owner.
- [ ] Supabase RLS/RPC matrix is attached to the review.

## Before any preview deployment

- [ ] Preview environment variables are confirmed not to point to production data unless explicitly intended.
- [ ] Preview Supabase project and storage buckets are identified.
- [ ] Paystack/Calendly/OpenAI test credentials are isolated from production.
- [ ] No production custom domain is attached to the preview.

## Before any production change

A separate approval is required with the exact payload for:

- [ ] Supabase RLS or policy changes.
- [ ] Auth settings or password-protection changes.
- [ ] `SECURITY DEFINER` grants or function changes.
- [ ] Edge Function deployment.
- [ ] Vercel production promotion.
- [ ] Billing, subscription, payout, or payment-provider changes.
- [ ] Data migrations or backfills.

## Rollback evidence

- [ ] Commit SHA recorded.
- [ ] Supabase migration/version recorded, if applicable.
- [ ] Vercel deployment ID recorded, if applicable.
- [ ] Reversible rollback command or procedure documented.
- [ ] Owner approval recorded.
