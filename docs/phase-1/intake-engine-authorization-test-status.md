# Intake Engine Authorization and Persistence Test Status

## Verified policy and schema

The endpoint rejects inactive profiles before looking up a request. Its live database policy is:
- `service_requests_client_select` permits a client only when the request's client row has `profile_id = auth.uid()`.
- `service_requests_coach_select` permits a coach only when `assigned_coach = auth.uid()`.
- `service_requests_staff_manage` permits profiles whose role is `staff` or `admin`.
- The live `ai_create_orchestration_run` function also requires an active profile and a supported role; it enforces client ownership and coach assignment while allowing staff/admin.
- The endpoint additionally requires a valid client ownership relationship before any role can pass.

The live constraints permit `service_requests.status` values `new`, `intake`, `awaiting_client`, `awaiting_review`, `ready_for_delivery`, `in_progress`, `client_review`, `completed`, `cancelled`, and `blocked`. `intake_sessions.status` permits `awaiting_client`, `awaiting_review`, `ready`, and `blocked`, among its other lifecycle values. These values were read from the connected production project's schema catalogs; no application rows were queried or modified. The repository branch has no checked-in Supabase migration files, so live schema metadata and policy definitions were used as the authoritative current constraints.

## Automated checks

Run:

```sh
npm run test:intake-authorization
npm run validate:linkedin-intake-evidence
npm run verify:phase4
deno fmt --check supabase/functions/_shared/intake-authorization.mjs supabase/functions/_shared/intake-outcome.mjs supabase/functions/careerdev-intake-engine-v2/authorization.test.mjs supabase/functions/careerdev-intake-engine-v2/intake-outcome.test.mjs
deno check --no-config supabase/functions/careerdev-intake-engine-v2/index.ts
```

The deterministic tests cover:
- True cross-client denial and client self-access.
- Assigned coach access and unassigned/no-assignment denial.
- Staff/admin access under the existing RLS policy.
- Inactive client, coach, staff, and admin denial.
- Unknown roles, missing/malformed client ownership, and missing/malformed assignment denial.
- Explicit mapping for all four supported recommendations and rejection of unsupported values.
- Both final status writes succeeding, either write failing, missing updated rows, thrown database errors, and the exact partial-write reporting.

The mapping is explicit: `awaiting_client` maps to `awaiting_client`; `awaiting_review` maps to `awaiting_review`; `ready` maps to intake-session `ready` and service-request `awaiting_review`; `blocked` maps to `blocked` in both tables. Review, ready, and blocked outcomes keep human review required and AI approval pending.

The two final status updates use checked row-returning updates in sequence. If the session update succeeds but the request update fails, the response reports that partial persistence and does not report success. There is no cross-table transaction; the existing schema offers no intake-status RPC, and this change does not add one. Gap and question persistence, session creation, AI usage metering, and AI-run logging are also checked. Persistence failures return safe generic messages without database/provider payloads and do not claim a queue exists.

## Authenticated integration tests

**Not run.** The connected `careerdevglobal-ai-test` project is active but currently has no applied migrations and no tables. Production was not used for writes or client document access.

Provision an isolated nonproduction environment with the reviewed schema and RLS policies, synthetic Auth users/profiles, client rows, and service requests. Run the Edge Function locally against that isolated project (or an approved isolated preview), use a stubbed AI-provider response for successful-path cases, and keep credentials in local environment variables or CI secrets. A provider test credential is not needed for denied-authorization cases. Start each case from a clean fixture so creation checks are deterministic.

| Synthetic actor and request | Expected result |
| --- | --- |
| Client A, request owned by Client A | Allowed |
| Client B, request owned by Client A | Denied |
| Assigned coach, request assigned to that coach | Allowed |
| Unassigned coach, request assigned to another coach or no coach | Denied |
| Active staff/admin, valid client-owned request | Allowed per current RLS policy |
| Inactive client, coach, staff, or admin | Denied |
| Unknown role | Denied |
| Any role with a missing/malformed client ownership relation | Denied |
| Coach with a missing/malformed assignment | Denied |

For every denied request, assert that no new intake session, `ai_runs` record, intake question, information gap, or AI usage event is created. For authorized success and failure scenarios, verify persisted session/request statuses and verify that a failed write produces a non-success response with accurate partial-write metadata. These integration tests remain pending until an isolated project with the required schema and fixtures is available.
