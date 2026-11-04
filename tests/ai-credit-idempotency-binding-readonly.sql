-- CareerDev Global / PR #42
-- READ-ONLY demonstration of the proposed null-safe replay comparison.
-- No real tables, user accounts, subscriptions, payments or ledger rows are used.
-- This does NOT invoke or validate the deployed reserve_ai_credits RPC.
WITH binding_cases(
  label, stored_execution, incoming_execution, stored_request,
  incoming_request, stored_agent, incoming_agent, expected_reject
) AS (
  VALUES
  ('exact_binding', '11111111-1111-4111-8111-111111111111'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
    'career_discovery_agent'::text, 'career_discovery_agent'::text, false),
  ('different_execution', '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
    'career_discovery_agent'::text, 'career_discovery_agent'::text, true),
  ('different_request', '11111111-1111-4111-8111-111111111111'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid, '44444444-4444-4444-8444-444444444444'::uuid,
    'career_discovery_agent'::text, 'career_discovery_agent'::text, true),
  ('different_agent', '11111111-1111-4111-8111-111111111111'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
    'career_discovery_agent'::text, 'other_agent'::text, true),
  ('null_stored_execution', null::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
    'career_discovery_agent'::text, 'career_discovery_agent'::text, true),
  ('null_stored_request', '11111111-1111-4111-8111-111111111111'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
    null::uuid, '33333333-3333-4333-8333-333333333333'::uuid,
    'career_discovery_agent'::text, 'career_discovery_agent'::text, true)
), results AS (
  SELECT label, expected_reject,
     (stored_execution IS DISTINCT FROM incoming_execution
      OR stored_request IS DISTINCT FROM incoming_request
      OR stored_agent IS DISTINCT FROM incoming_agent) AS deny_reuse
  FROM binding_cases
)
SELECT label, expected_reject, deny_reuse, expected_reject=deny_reuse AS passed
FROM results ORDER BY label;
