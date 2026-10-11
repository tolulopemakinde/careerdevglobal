# Isolated Authorization Test Plan — Phase 1

## Environment discovery

The connected Supabase account currently exposes one project only:

- Project: `careerdev-global`
- Ref: `ufmhrmzumqkjvaezrmxf`
- Status: `ACTIVE_HEALTHY`
- Region: `eu-west-1`

No separate preview, staging, or test Supabase project was available during discovery.

## Current safe status

The authorization test manifest is intentionally **production-blocked**. It describes synthetic tests but does not connect to Supabase, create users, invoke RPCs, upload files, charge credits, reset workspaces, or alter data.

Run locally to validate only the manifest structure:

```bash
npm run validate:auth-manifest
```

## Required preview setup before execution

A separate Supabase project or isolated database must be provisioned and identified. It must contain:

1. The reviewed schema and migrations at a known commit.
2. Test-only Auth users for anonymous, client, coach, staff, and admin cases.
3. Test-only storage buckets and synthetic documents.
4. Test-only payment and scheduling provider stubs; no live Paystack or Calendly credentials.
5. OpenAI test budget or deterministic model stubs; no uncontrolled production spend.
6. A test data reset procedure.
7. Logs that exclude secrets and redact personal data.
8. A clear teardown procedure after each run.

## Execution controls

The test runner must refuse to start when the target project ref equals the production ref `ufmhrmzumqkjvaezrmxf`. It must require an explicit preview marker and synthetic test-user identifiers. It must run read-only authorization cases before mutation cases, stop on any cross-user access failure, and write only to test-scoped records.

No production execution is authorized by this artifact.

## Test sequence

### Stage A — identity and authorization

Run anonymous, client, coach, staff, and admin role tests against representative RPCs. Verify denial and approved-field behavior.

### Stage B — ownership and privacy

Use two synthetic clients and two synthetic coaches. Verify that execution, credit, document, profile, booking, and workspace-reset operations cannot cross tenant boundaries. Verify public coach responses contain only approved public fields.

### Stage C — AI governance

Use a synthetic execution whose registry configuration requires human review. Verify completion is blocked before approval and allowed only after an independent approval record.

### Stage D — idempotency and failure recovery

Repeat credit reservation, payout preparation, webhook application, and workflow retry requests. Verify no double charge, duplicate provider transfer, duplicate webhook state transition, or duplicate delivered output.

### Stage E — abuse and bounds

Submit oversized payloads, invalid enum values, excessive limits, malformed identifiers, and repeated requests. Verify bounded rejection, stable error classes, and no sensitive data in errors.

## Exit criteria

The preview test phase is complete only when all critical cases pass, all unexpected data accesses are explained, all failures are reproducible, and the owner approves any required RLS/grant/function changes separately.
