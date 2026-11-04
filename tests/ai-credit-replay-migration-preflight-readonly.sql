-- CareerDev Global, read-only migration preflight and post-change inspection.
-- Run ONLY against the intended isolated test database. No account rows exposed.
-- Never treat these checks as authenticated end-to-end billing acceptance.
--
-- Preflight expected BEFORE application:
-- baseline_matches = true, payment_guard_present = true,
-- advisory_lock_present = true, binding_fix_present = false.
-- Post-migration expected AFTER isolated, authorized application:
-- baseline_matches = false, binding_fix_present = true;
-- other guards must remain present in both states.

WITH deployed AS (
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='reserve_ai_credits'
    AND pg_get_function_identity_arguments(p.oid) LIKE 'p_operation_key text,%'
)
SELECT count(*)=1 AS expected_single_signature,
       bool_and(md5(definition)='62d121ebc7076de1ac5aaf557e6d5749') AS baseline_matches,
       bool_and(position('public.ai_payment_access_allowed(s.id)' IN definition)>0) AS payment_guard_present,
       bool_and(position('pg_advisory_xact_lock' IN definition)>0) AS advisory_lock_present,
       bool_and(position('v_existing.execution_id is distinct from p_execution_id' IN definition)>0
         AND position('v_existing.request_id is distinct from p_request_id' IN definition)>0
         AND position('v_existing.agent_key is distinct from v_op.agent_key' IN definition)>0
       ) AS binding_fix_present
FROM deployed;
