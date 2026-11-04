-- CareerDev Global: read-only release-gate snapshot for isolated Supabase TEST.
-- Execute ONLY against project yyevuwvtrktrzwuzeddo.
-- Does not read identifiable user rows, emails, tokens, payment payloads or secrets.
-- Never use this query to automatically approve production billing release.

-- The database function must have the exact idempotency binding.
SELECT current_setting('server_version') AS postgres_version,
       md5(pg_get_functiondef(p.oid)) AS reserve_function_md5,
       p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
       position('v_existing.execution_id is distinct from p_execution_id'
         IN pg_get_functiondef(p.oid)) > 0 AS execution_binding_present,
       position('v_existing.request_id is distinct from p_request_id'
         IN pg_get_functiondef(p.oid)) > 0 AS request_binding_present,
       position('v_existing.agent_key is distinct from v_op.agent_key'
         IN pg_get_functiondef(p.oid)) > 0 AS agent_binding_present,
       position('public.ai_payment_access_allowed(s.id)'
         IN pg_get_functiondef(p.oid)) > 0 AS payment_guard_present
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='reserve_ai_credits';

-- Test provenance cannot be inferred from age, confirmation, or a publishable key.
SELECT count(*) AS auth_users,
       count(*) FILTER (WHERE created_at >= now()-interval '30 days') AS created_last_30_days,
       count(*) FILTER (WHERE raw_app_meta_data ? 'test'
         OR raw_app_meta_data ? 'synthetic'
         OR raw_app_meta_data->>'environment'='test') AS explicit_server_test_markers,
       count(*) FILTER (WHERE raw_user_meta_data ? 'test'
         OR raw_user_meta_data ? 'synthetic') AS user_editable_test_markers
FROM auth.users;

-- Both gates must remain disabled until a separately approved release.
SELECT count(*) AS billing_config_rows,
       count(*) FILTER (WHERE self_service_enabled IS TRUE) AS enabled_billing_rows
FROM public.ai_billing_release_config;
SELECT count(*) AS refund_config_rows,
       count(*) FILTER (WHERE enabled IS TRUE) AS enabled_refund_rows
FROM public.ai_refund_policy_config;

-- Aggregate credit states only; never read user IDs, metadata or receipt payloads.
SELECT status,count(*) AS ledger_rows,
       count(*) FILTER (WHERE runtime_claimed_at IS NOT NULL) AS runtime_claimed,
       coalesce(sum(credits),0) AS total_credits
FROM public.ai_credit_ledger GROUP BY status ORDER BY status;

-- Do NOT equate provider-API-verified events with HMAC-signed webhooks.
-- These historical aggregates need separate authorization/provenance review.
SELECT provider_key,coalesce(verification_source,'<unset>') AS verification_source,
       signature_verified,processing_status,count(*) AS events,
       count(*) FILTER (WHERE verified_payment IS NOT NULL) AS provider_payment_attached
FROM public.ai_agent_subscription_webhook_events
GROUP BY provider_key,verification_source,signature_verified,processing_status
ORDER BY events DESC;
