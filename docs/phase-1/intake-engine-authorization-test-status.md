# Intake Engine Authorization Test Status

## Automated checks

The intake request authorization decision is covered by deterministic unit tests in `supabase/functions/careerdev-intake-engine-v2/authorization.test.mjs`. They cover client ownership, cross-client denial, assigned and unassigned coaches, staff/admin access, inactive accounts, and denial of unrecognized roles.

Run the local checks with:

```sh
npm run test:intake-authorization
npm run validate:linkedin-intake-evidence
npm run verify:phase4
deno fmt --check supabase/functions/_shared/intake-authorization.mjs supabase/functions/careerdev-intake-engine-v2/authorization.test.mjs
deno check --no-config supabase/functions/careerdev-intake-engine-v2/index.ts
```

## Authenticated integration tests

No authenticated Edge Function integration test was executed. It requires an isolated Supabase project with the reviewed schema and migrations, synthetic Auth users for client/coach/staff/admin, and synthetic requests for ownership and assignment cases. The connected `careerdevglobal-ai-test` project currently has no migrations or tables, so it is not ready for these scenarios. The production `careerdev-global` project must not be used for test writes.

When an isolated test project is provisioned, keep its credentials in a local environment or CI secret store, never in the repository. Run the authenticated request matrix there and verify both the HTTP response and that denied requests create no intake session, AI run, question, or usage event.
