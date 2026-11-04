-- CareerDev Global. ADDITIVE MIGRATION -- applied only to isolated TEST; production remains gated.
-- Supabase CLI v2 generated this file on the billing draft branch on 2026-11-04.
-- Derived from the inspected deployed TEST source, not from an older main-branch baseline.
-- This SQL is deliberately pinned to the exact observed test function to prevent
-- overwriting newer/drifted implementations in another environment.
-- Protects existing subscription, Paystack entitlement and credit reservation logic.
-- No grants or table data are modified.
--
-- IMPORTANT: Before approval: verify synthetic-user provenance, test payment
-- isolation, snapshot deployed source, and run authenticated transactional SQL QA.
--
-- The expected fingerprint is a *source drift guard*, not a password/secret.
DO $ai_credit_replay_preflight$
DECLARE
  v_current text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_current
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='reserve_ai_credits'
    AND pg_get_function_identity_arguments(p.oid) LIKE 'p_operation_key text,%'
  LIMIT 1;

  IF v_current IS NULL OR (md5(v_current) <> '62d121ebc7076de1ac5aaf557e6d5749' AND md5(v_current) <> 'b9c0ffb6432e9f9da7d8010845df0e77') THEN
    RAISE EXCEPTION 'Credit replay migration blocked: deployed reserve_ai_credits source does not match audited test snapshot; source drift: review authoritative definition';
  END IF;
  IF position('public.ai_payment_access_allowed(s.id)' IN v_current)=0 OR
     position('pg_advisory_xact_lock' IN v_current)=0 THEN
    RAISE EXCEPTION 'Credit replay migration blocked: payment-access or concurrency guard missing';
  END IF;
END
$ai_credit_replay_preflight$;

CREATE OR REPLACE FUNCTION public.reserve_ai_credits(p_operation_key text, p_execution_id uuid DEFAULT NULL::uuid, p_request_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(allowed boolean, reason text, ledger_id uuid, credits_required integer, credits_remaining integer, monthly_allowance integer, credits_consumed integer, credits_reserved integer, period_start timestamp with time zone, period_end timestamp with time zone, plan_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_sub public.ai_agent_subscriptions%rowtype;
  v_plan public.ai_agent_subscription_plans%rowtype;
  v_op public.ai_credit_operations%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_consumed integer := 0;
  v_reserved integer := 0;
  v_existing public.ai_credit_ledger%rowtype;
  v_ledger_id uuid;
  v_key text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select p.role into v_role from public.profiles p where p.id=v_user_id;
  if not exists(select 1 from public.profiles where id=v_user_id and status='active' and role in ('client','coach','staff','admin')) then raise exception 'Active account required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||v_user_id::text,0));
  if v_role in ('admin','staff') then
    return query select true,'internal_staff_usage_no_customer_credit',null::uuid,0,0,0,0,0,now(),now(),null::text; return;
  end if;
  select o.* into v_op from public.ai_credit_operations o where o.operation_key=p_operation_key and o.active=true;
  if not found then raise exception 'Unknown or inactive AI credit operation: %',p_operation_key; end if;
  if p_execution_id is null or p_request_id is null or not exists(
    select 1 from public.ai_agent_execution_requests r join public.ai_agent_registry a on a.id=r.agent_id
    where r.id=p_request_id and r.execution_id=p_execution_id and r.requested_by=v_user_id and a.agent_key=v_op.agent_key
  ) then raise exception 'Owned matching agent execution required'; end if;
  v_key:=coalesce(nullif(trim(p_idempotency_key),''),coalesce(p_execution_id::text,p_request_id::text,p_operation_key||':'||clock_timestamp()::text));
  select s.* into v_sub from public.ai_agent_subscriptions s where s.user_id=v_user_id and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention') and s.current_period_start <= now() and s.current_period_end > now() order by s.updated_at desc limit 1 for update;
  if not found then return query select false,'no_active_ai_subscription',null::uuid,0,0,0,0,0,now(),now(),null::text; return; end if;
  select p.* into v_plan from public.ai_agent_subscription_plans p where p.plan_key=v_sub.plan_key and p.active=true;
  if not found then return query select false,'subscription_plan_unavailable',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
  if v_op.agent_key is not null and not (v_op.agent_key=any(v_plan.included_agents)) then return query select false,'agent_not_in_plan',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
  select l.* into v_existing from public.ai_credit_ledger l where l.user_id=v_user_id and l.idempotency_key=v_key limit 1;
  if found then
    if v_existing.status='released' or v_existing.operation_key<>p_operation_key or v_existing.period_end<=now() or v_existing.subscription_id<>v_sub.id or v_existing.execution_id is distinct from p_execution_id or v_existing.request_id is distinct from p_request_id or v_existing.agent_key is distinct from v_op.agent_key then return query select false,'idempotency_key_not_reusable',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
    select coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0),coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0)
      into v_consumed,v_reserved from public.ai_credit_ledger l where l.user_id=v_user_id and l.period_start=v_existing.period_start and l.period_end=v_existing.period_end;
    select p.monthly_credits into v_plan.monthly_credits from public.ai_agent_subscription_plans p where p.plan_key=v_existing.plan_key;
    return query select true,'idempotent_existing_request',v_existing.id,v_existing.credits,greatest(v_plan.monthly_credits-v_consumed-v_reserved,0),v_plan.monthly_credits,v_consumed,v_reserved,v_existing.period_start,v_existing.period_end,v_existing.plan_key; return;
  end if;
  v_period_start:=date_trunc('month',coalesce(v_sub.current_period_start,now()));
  if v_period_start>now() then v_period_start:=date_trunc('month',now()); end if;
  while v_period_start+interval '1 month'<=now() loop v_period_start:=v_period_start+interval '1 month'; end loop;
  v_period_end:=v_period_start+interval '1 month';
  select coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0),coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0)
    into v_consumed,v_reserved from public.ai_credit_ledger l where l.user_id=v_user_id and l.period_start=v_period_start and l.period_end=v_period_end;
  if v_op.credit_cost=0 then
    return query select true,'no_customer_credit_required',null::uuid,0,greatest(v_plan.monthly_credits-v_consumed-v_reserved,0),v_plan.monthly_credits,v_consumed,v_reserved,v_period_start,v_period_end,v_sub.plan_key; return;
  end if;
  if v_consumed+v_reserved+v_op.credit_cost>v_plan.monthly_credits then
    return query select false,'insufficient_ai_credits',null::uuid,v_op.credit_cost,greatest(v_plan.monthly_credits-v_consumed-v_reserved,0),v_plan.monthly_credits,v_consumed,v_reserved,v_period_start,v_period_end,v_sub.plan_key; return;
  end if;
  insert into public.ai_credit_ledger(user_id,subscription_id,plan_key,period_start,period_end,operation_key,agent_key,execution_id,request_id,credits,status,idempotency_key,metadata)
  values(v_user_id,v_sub.id,v_sub.plan_key,v_period_start,v_period_end,v_op.operation_key,v_op.agent_key,p_execution_id,p_request_id,v_op.credit_cost,'reserved',v_key,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_ledger_id;
  return query select true,'credits_reserved',v_ledger_id,v_op.credit_cost,v_plan.monthly_credits-v_consumed-v_reserved-v_op.credit_cost,v_plan.monthly_credits,v_consumed,v_reserved+v_op.credit_cost,v_period_start,v_period_end,v_sub.plan_key;
end;
$function$;
