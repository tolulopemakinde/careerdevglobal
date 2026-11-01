-- Durable serialization across provider calls. Only service-role endpoints may mutate operations.
create table public.ai_billing_operations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  subscription_id uuid not null references public.ai_agent_subscriptions(id),
  action text not null check(action in ('cancel','upgrade','checkout')),
  target_plan_key text references public.ai_agent_subscription_plans(plan_key),
  status text not null default 'prepared' check(status in ('prepared','provider_requested','confirmed','reconciliation_required')),
  response jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index ai_billing_one_open_operation on public.ai_billing_operations(user_id) where status<>'confirmed';
create index ai_billing_operation_subscription_idx on public.ai_billing_operations(subscription_id);
create index ai_billing_operation_plan_idx on public.ai_billing_operations(target_plan_key);
alter table public.ai_billing_operations enable row level security;
revoke all on public.ai_billing_operations from public,anon,authenticated;
grant all on public.ai_billing_operations to service_role;

create or replace function public.begin_ai_subscription_cancellation(p_user_id uuid,p_target_plan_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sub public.ai_agent_subscriptions%rowtype; v_op public.ai_billing_operations%rowtype;
 v_current public.ai_agent_subscription_plans%rowtype; v_target public.ai_agent_subscription_plans%rowtype; v_action text; v_target_price numeric;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and status='active' and role in ('client','coach')) then raise exception 'Active client or coach required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||p_user_id::text,0));
 if (select count(*) from public.ai_agent_subscriptions where user_id=p_user_id and status in ('active','attention','non_renewing'))<>1 then raise exception 'Exactly one subscription required; contact billing support'; end if;
 select * into v_sub from public.ai_agent_subscriptions where user_id=p_user_id and status in ('active','attention','non_renewing') for update;
 v_action:=case when p_target_plan_key is null then 'cancel' else 'upgrade' end;
 if p_target_plan_key is not null then
   select * into v_current from public.ai_agent_subscription_plans where plan_key=v_sub.plan_key;
   select * into v_target from public.ai_agent_subscription_plans where plan_key=p_target_plan_key and active;
   if not found or v_target.monthly_credits<=v_current.monthly_credits or not v_target.included_agents @> v_current.included_agents then raise exception 'Target is not an eligible upgrade'; end if;
   v_target_price:=case when v_sub.currency='NGN' then case when v_sub.billing_interval='annual' then v_target.annual_price_ngn else v_target.monthly_price_ngn end else case when v_sub.billing_interval='annual' then v_target.annual_price else v_target.monthly_price end end;
   if v_target_price is null or v_target_price<=v_sub.amount then raise exception 'Target price must exceed current plan'; end if;
 end if;
 select * into v_op from public.ai_billing_operations where user_id=p_user_id and status<>'confirmed' for update;
 if found then
   if v_op.subscription_id<>v_sub.id or v_op.action<>v_action or v_op.target_plan_key is distinct from p_target_plan_key then raise exception 'Another billing operation requires reconciliation'; end if;
   return to_jsonb(v_op)||jsonb_build_object('subscription',to_jsonb(v_sub));
 end if;
 -- A confirmed cancellation is idempotent; scheduling an upgrade may still record its intent.
 insert into public.ai_billing_operations(user_id,subscription_id,action,target_plan_key)
 values(p_user_id,v_sub.id,v_action,p_target_plan_key) returning * into v_op;
 return to_jsonb(v_op)||jsonb_build_object('subscription',to_jsonb(v_sub));
end;
$$;

create or replace function public.claim_ai_billing_operation(p_operation_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_changed integer;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 update public.ai_billing_operations set status='provider_requested',updated_at=now() where id=p_operation_id and status='prepared';
 get diagnostics v_changed=row_count;
 return v_changed=1;
end;
$$;

create or replace function public.finish_ai_subscription_cancellation(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op public.ai_billing_operations%rowtype; v_sub public.ai_agent_subscriptions%rowtype; v_result jsonb;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into v_op from public.ai_billing_operations where id=p_operation_id;
 if not found or v_op.action not in ('cancel','upgrade') then raise exception 'Cancellation operation required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||v_op.user_id::text,0));
 select * into v_op from public.ai_billing_operations where id=p_operation_id for update;
 if v_op.status='confirmed' then return v_op.response; end if;
 select * into v_sub from public.ai_agent_subscriptions where id=v_op.subscription_id and user_id=v_op.user_id for update;
 if not found then raise exception 'Owned subscription required'; end if;
 v_result:=jsonb_build_object('ok',true,'status',case when v_sub.current_period_end>now() then 'non_renewing' else 'cancelled' end,'current_period_end',v_sub.current_period_end,'upgrade_plan_key',v_op.target_plan_key,'upgrade_requires_checkout',v_op.action='upgrade');
 update public.ai_agent_subscriptions set status=case when current_period_end>now() then 'non_renewing' else 'cancelled' end,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('renewal_disabled',true,'renewal_disabled_at',now(),'scheduled_upgrade_plan_key',v_op.target_plan_key),updated_at=now()
 where id=v_sub.id and status not in ('cancelled','expired');
 update public.ai_billing_operations set status='confirmed',response=v_result,updated_at=now() where id=p_operation_id;
 return v_result;
end;
$$;
revoke all on function public.begin_ai_subscription_cancellation(uuid,text),public.claim_ai_billing_operation(uuid),public.finish_ai_subscription_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.begin_ai_subscription_cancellation(uuid,text),public.claim_ai_billing_operation(uuid),public.finish_ai_subscription_cancellation(uuid) to service_role;

-- Checkout is prepared before any external provider call; only one unresolved checkout per account.
create or replace function public.prepare_ai_subscription_checkout(p_user_id uuid,p_plan_key text,p_billing_interval text,p_currency text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_plan public.ai_agent_subscription_plans%rowtype; v_sub public.ai_agent_subscriptions%rowtype;
 v_op public.ai_billing_operations%rowtype; v_amount numeric; v_code text;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and status='active' and role in ('client','coach')) then raise exception 'Active client or coach required'; end if;
 if p_billing_interval is null or p_billing_interval not in ('monthly','annual') or p_currency is null or p_currency not in ('USD','NGN') then raise exception 'Invalid billing interval or currency'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||p_user_id::text,0));
 if exists(select 1 from public.ai_agent_subscriptions where user_id=p_user_id and
   (status in ('active','attention') or (status='non_renewing' and (current_period_end is null or current_period_end>now())))) then raise exception 'Manage your existing subscription before opening another checkout'; end if;
 select * into v_op from public.ai_billing_operations where user_id=p_user_id and status<>'confirmed' for update;
 if found then
   select * into v_sub from public.ai_agent_subscriptions where id=v_op.subscription_id;
   if v_op.action<>'checkout' or v_sub.plan_key<>p_plan_key or v_sub.currency<>p_currency or v_sub.billing_interval<>p_billing_interval then raise exception 'Another billing operation requires reconciliation'; end if;
   return to_jsonb(v_op)||jsonb_build_object('subscription',to_jsonb(v_sub));
 end if;
 if exists(select 1 from public.ai_agent_subscriptions where user_id=p_user_id and status='pending') then raise exception 'Pending payment requires reconciliation'; end if;
 select * into v_plan from public.ai_agent_subscription_plans where plan_key=p_plan_key and active;
 if not found then raise exception 'Plan unavailable'; end if;
 if p_currency='NGN' then
   v_amount:=case when p_billing_interval='monthly' then v_plan.monthly_price_ngn else v_plan.annual_price_ngn end;
   v_code:=case when p_billing_interval='monthly' then v_plan.paystack_monthly_plan_code_ngn else v_plan.paystack_annual_plan_code_ngn end;
 else
   v_amount:=case when p_billing_interval='monthly' then v_plan.monthly_price else v_plan.annual_price end;
   v_code:=case when p_billing_interval='monthly' then v_plan.paystack_monthly_plan_code else v_plan.paystack_annual_plan_code end;
 end if;
 if v_amount is null or v_amount<=0 or v_code is null then raise exception 'Verified provider plan configuration required'; end if;
 insert into public.ai_agent_subscriptions(user_id,plan_key,billing_interval,status,currency,amount,paystack_plan_code)
 values(p_user_id,p_plan_key,p_billing_interval,'pending',p_currency,v_amount,v_code) returning * into v_sub;
 update public.ai_agent_subscriptions set paystack_transaction_reference='CDG-AI-'||replace(v_sub.id::text,'-','') where id=v_sub.id returning * into v_sub;
 insert into public.ai_billing_operations(user_id,subscription_id,action) values(p_user_id,v_sub.id,'checkout') returning * into v_op;
 return to_jsonb(v_op)||jsonb_build_object('subscription',to_jsonb(v_sub));
end;
$$;
revoke all on function public.prepare_ai_subscription_checkout(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_ai_subscription_checkout(uuid,text,text,text) to service_role;

-- Incremental migration against the inspected production billing schema.
-- Run in a disposable project first. No plan prices, agent registry or historical data are changed.
create table public.ai_subscription_payments (
  reference text primary key,
  subscription_id uuid not null references public.ai_agent_subscriptions(id),
  provider_transaction_id text not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency in ('USD','NGN')),
  paid_at timestamptz not null,
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  created_at timestamptz not null default now()
);
create index ai_subscription_payments_subscription_idx on public.ai_subscription_payments(subscription_id);
alter table public.ai_subscription_payments enable row level security;
revoke all on public.ai_subscription_payments from public,anon,authenticated;
grant all on public.ai_subscription_payments to service_role;

alter table public.ai_agent_subscription_webhook_events add column verified_payment jsonb;
alter table public.ai_agent_subscription_webhook_events add column verification_source text not null default 'webhook_hmac' check(verification_source in ('webhook_hmac','provider_api'));

-- Browser roles do not need DDL-like privileges. RLS does not protect TRUNCATE.
revoke truncate,references,trigger,insert,update,delete on public.ai_agent_subscriptions,public.ai_agent_subscription_plans,public.ai_credit_ledger from anon,authenticated;
revoke all on public.ai_agent_subscription_webhook_events from public,anon,authenticated;

-- Refuse ambiguous historical identifiers; never silently choose one customer's row.
create unique index ai_sub_provider_code_unique on public.ai_agent_subscriptions(paystack_subscription_code) where paystack_subscription_code is not null;
create unique index ai_sub_checkout_reference_unique on public.ai_agent_subscriptions(paystack_transaction_reference) where paystack_transaction_reference is not null;

-- The old marketplace INSERT trigger bypasses the new transaction and has unsafe fallbacks.
drop trigger if exists trg_sync_ai_agent_subscription_from_paystack_webhook on public.marketplace_payment_webhook_events;
-- Preserve its function for incident comparison; it has no remaining write trigger.

create or replace function public.apply_ai_subscription_webhook_state(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.ai_agent_subscription_webhook_events%rowtype;
  v_sub public.ai_agent_subscriptions%rowtype;
  v_payment public.ai_subscription_payments%rowtype;
  v_ref text; v_code text; v_customer text; v_plan text;
  v_by_ref uuid; v_by_code uuid; v_id uuid; v_status text;
  v_start timestamptz; v_end timestamptz; v_paid timestamptz;
  v_tx text; v_amount bigint; v_currency text; v_failure timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
  select * into v_event from public.ai_agent_subscription_webhook_events where id=p_event_id for update;
  if not found then raise exception 'Webhook event not found'; end if;
  if v_event.provider_key <> 'paystack' or not ((v_event.verification_source='webhook_hmac' and v_event.signature_verified is true) or (v_event.verification_source='provider_api' and v_event.verified_payment is not null)) then raise exception 'Verified Paystack event required'; end if;
  if v_event.event_type not in ('subscription.create','subscription.disable','subscription.not_renew','invoice.create','invoice.payment_failed','invoice.update','charge.success') then raise exception 'Unsupported AI webhook event'; end if;
  if v_event.processing_status='processed' then return jsonb_build_object('processed',true,'duplicate',true); end if;
  if v_event.processing_status not in ('verified','failed','unmatched') then raise exception 'Invalid event state'; end if;
  if v_event.payload->>'event' is distinct from v_event.event_type then raise exception 'Event type mismatch'; end if;
  v_ref:=nullif(v_event.transaction_reference,'');
  v_code:=nullif(coalesce(v_event.payload#>>'{data,subscription_code}',v_event.payload#>>'{data,subscription,subscription_code}'),'');
  if v_ref is not null then
    select id into v_by_ref from public.ai_agent_subscriptions where paystack_transaction_reference=v_ref;
    if v_by_ref is null then select subscription_id into v_by_ref from public.ai_subscription_payments where reference=v_ref; end if;
  end if;
  if v_code is not null then select id into v_by_code from public.ai_agent_subscriptions where paystack_subscription_code=v_code; end if;
  if v_by_ref is not null and v_by_code is not null and v_by_ref<>v_by_code then raise exception 'Conflicting provider identifiers'; end if;
  v_id:=coalesce(v_by_ref,v_by_code);
  if v_id is null then
    update public.ai_agent_subscription_webhook_events set processing_status='unmatched',error_message='No exact subscription match' where id=p_event_id;
    return jsonb_build_object('processed',false,'unmatched',true);
  end if;
  -- Same account lock as checkout and cancellation; event row is always locked first.
  perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||(select user_id::text from public.ai_agent_subscriptions where id=v_id),0));
  select * into v_sub from public.ai_agent_subscriptions where id=v_id for update;
  if v_event.subscription_id is not null and v_event.subscription_id<>v_id then raise exception 'Recorded subscription mismatch'; end if;
  if v_code is not null and v_sub.paystack_subscription_code is not null and v_code<>v_sub.paystack_subscription_code then raise exception 'Conflicting provider identifiers'; end if;
  v_customer:=nullif(coalesce(v_event.payload#>>'{data,customer,customer_code}',v_event.payload#>>'{data,subscription,customer,customer_code}'),'');
  v_plan:=nullif(coalesce(v_event.payload#>>'{data,plan,plan_code}',v_event.payload#>>'{data,subscription,plan,plan_code}'),'');
  if v_customer is not null and v_sub.paystack_customer_code is not null and v_customer<>v_sub.paystack_customer_code then raise exception 'Customer mismatch'; end if;
  if v_plan is not null and v_sub.paystack_plan_code is not null and v_plan<>v_sub.paystack_plan_code then raise exception 'Plan mismatch'; end if;
  v_status:=v_sub.status;
  if v_event.event_type in ('subscription.disable','subscription.not_renew') then
    if v_status not in ('cancelled','expired') then v_status:=case when v_sub.current_period_end>now() then 'non_renewing' else 'cancelled' end; end if;
    -- Cancellation never changes a paid period.
  elsif v_event.event_type='charge.success' or (v_event.event_type='invoice.update' and lower(v_event.payload#>>'{data,status}') in ('paid','success')) then
    -- The Edge Function must first verify this exact transaction with Paystack.
    if v_event.verified_payment is null then raise exception 'Provider payment verification required'; end if;
    if v_event.verified_payment->>'reference' is distinct from v_ref or v_event.verified_payment->>'status' is distinct from 'success' then raise exception 'Verified transaction mismatch'; end if;
    v_tx:=nullif(v_event.verified_payment->>'transaction_id','');
    v_amount:=(v_event.verified_payment->>'amount_minor')::bigint;
    v_currency:=v_event.verified_payment->>'currency';
    v_start:=(v_event.verified_payment->>'period_start')::timestamptz;
    v_end:=(v_event.verified_payment->>'period_end')::timestamptz;
    v_paid:=(v_event.verified_payment->>'paid_at')::timestamptz;
    if v_tx is null or v_amount is distinct from round(v_sub.amount*100)::bigint or v_currency is distinct from v_sub.currency then raise exception 'Payment amount or currency mismatch'; end if;
    if v_start is null or v_end is null or v_paid is null or not isfinite(v_start) or not isfinite(v_end) or not isfinite(v_paid) or v_end<=v_start or v_start>now()+interval '5 minutes' or v_paid>now()+interval '5 minutes' then raise exception 'Invalid verified paid period'; end if;
    if v_end > v_start + (case v_sub.billing_interval when 'annual' then interval '1 year 2 days' else interval '1 month 2 days' end) then raise exception 'Paid period exceeds billing interval'; end if;
    if v_sub.paystack_subscription_code is not null and v_event.verified_payment->>'subscription_code' is distinct from v_sub.paystack_subscription_code then raise exception 'Verified subscription mismatch'; end if;
    if v_sub.paystack_customer_code is not null and v_event.verified_payment->>'customer_code' is distinct from v_sub.paystack_customer_code then raise exception 'Verified customer mismatch'; end if;
    if v_event.verified_payment->>'plan_code' is distinct from v_sub.paystack_plan_code then raise exception 'Verified plan mismatch'; end if;
    if v_code is not null and v_code is distinct from v_event.verified_payment->>'subscription_code' then raise exception 'Verified subscription mismatch'; end if;
    v_code:=v_event.verified_payment->>'subscription_code';
    v_customer:=v_event.verified_payment->>'customer_code';
    select * into v_payment from public.ai_subscription_payments where reference=v_ref;
    if found then
      if v_payment.subscription_id<>v_id or v_payment.provider_transaction_id<>v_tx or v_payment.amount_minor<>v_amount or v_payment.currency<>v_currency or v_payment.period_start<>v_start or v_payment.period_end<>v_end then raise exception 'Payment identity collision'; end if;
    else
      insert into public.ai_subscription_payments(reference,subscription_id,provider_transaction_id,amount_minor,currency,paid_at,period_start,period_end)
      values(v_ref,v_id,v_tx,v_amount,v_currency,v_paid,v_start,v_end);
    end if;
    if v_status not in ('cancelled','expired') then
      if v_status<>'non_renewing' and (v_sub.current_period_end is null or v_end>=v_sub.current_period_end) then v_status:='active'; end if;
      -- One payment reference cannot reset an allowance. Only a strictly newer paid end advances the period.
      if v_end>coalesce(v_sub.current_period_end,'-infinity'::timestamptz) then
        update public.ai_agent_subscriptions set current_period_start=v_start,current_period_end=v_end where id=v_id;
      end if;
    end if;
  elsif v_event.event_type='invoice.payment_failed' or (v_event.event_type='invoice.update' and lower(v_event.payload#>>'{data,status}')='failed') then
    v_failure:=nullif(coalesce(v_event.payload#>>'{data,period_end}',v_event.payload#>>'{data,created_at}'),'')::timestamptz;
    if v_status in ('active','attention') and v_failure is not null and v_failure>=coalesce(v_sub.current_period_end,'infinity'::timestamptz) then v_status:='attention'; end if;
  end if;
  -- subscription.create and invoice.create can link provider identity, but never prove payment.
  if v_event.verified_payment is not null then
    update public.ai_billing_operations set status='confirmed',updated_at=now(),response=jsonb_build_object('payment_verified',true) where subscription_id=v_id and action='checkout' and status<>'confirmed';
  end if;
  update public.ai_agent_subscriptions set status=v_status,
    paystack_subscription_code=coalesce(v_sub.paystack_subscription_code,v_code),
    paystack_customer_code=coalesce(v_sub.paystack_customer_code,v_customer),
    metadata=coalesce(v_sub.metadata,'{}'::jsonb)||jsonb_build_object('last_webhook_event',v_event.event_type,'last_webhook_event_reference',v_event.provider_event_reference),updated_at=now()
  where id=v_id;
  update public.ai_agent_subscription_webhook_events set processing_status='processed',subscription_id=v_id,error_message=null,processed_at=now() where id=p_event_id;
  return jsonb_build_object('processed',true,'subscription_id',v_id,'status',v_status);
end;
$$;
revoke all on function public.apply_ai_subscription_webhook_state(uuid) from public,anon,authenticated;
grant execute on function public.apply_ai_subscription_webhook_state(uuid) to service_role;

-- Privileged, audited replay. No browser role can invoke it or alter stored events.
create table public.ai_billing_reconciliation_audit (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.ai_agent_subscription_webhook_events(id),
  actor_id uuid not null references public.profiles(id), reason text not null check(length(reason) between 10 and 500),
  result jsonb not null, created_at timestamptz not null default now()
);
alter table public.ai_billing_reconciliation_audit enable row level security;
revoke all on public.ai_billing_reconciliation_audit from public,anon,authenticated;
grant all on public.ai_billing_reconciliation_audit to service_role;
create index ai_billing_reconciliation_event_idx on public.ai_billing_reconciliation_audit(event_id);
create index ai_billing_reconciliation_actor_idx on public.ai_billing_reconciliation_audit(actor_id);
create or replace function public.reconcile_ai_subscription_event(p_event_id uuid,p_actor_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and role in ('admin','staff') and status='active') then raise exception 'Active operator required'; end if;
  if p_reason is null or length(p_reason) not between 10 and 500 then raise exception 'Reconciliation reason required'; end if;
  begin
    v_result:=public.apply_ai_subscription_webhook_state(p_event_id);
  exception when others then
    update public.ai_agent_subscription_webhook_events set processing_status='failed',error_message='Reconciliation validation failed' where id=p_event_id and processing_status<>'processed';
    v_result:=jsonb_build_object('processed',false,'reconciliation_required',true);
  end;
  insert into public.ai_billing_reconciliation_audit(event_id,actor_id,reason,result) values(p_event_id,p_actor_id,p_reason,v_result);
  return v_result;
end;
$$;
revoke all on function public.reconcile_ai_subscription_event(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reconcile_ai_subscription_event(uuid,uuid,text) to service_role;


-- Preserve existing monthly allowance policy and RPC signatures; require a real paid interval.
CREATE OR REPLACE FUNCTION public.get_my_ai_credit_status()
 RETURNS TABLE(plan_key text, monthly_allowance integer, credits_consumed integer, credits_reserved integer, credits_remaining integer, period_start timestamp with time zone, period_end timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_sub public.ai_agent_subscriptions%rowtype;
  v_allowance integer := 0;
  v_start timestamptz;
  v_end timestamptz;
  v_consumed integer := 0;
  v_reserved integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select * into v_sub from public.ai_agent_subscriptions
  where user_id=v_user_id and status in ('active','non_renewing','attention')
    and current_period_start <= now() and current_period_end > now()
  order by updated_at desc limit 1;

  if not found then
    return query select null::text,0,0,0,0,now(),now();
    return;
  end if;

  select p.monthly_credits into v_allowance from public.ai_agent_subscription_plans p where p.plan_key=v_sub.plan_key and p.active=true;
  v_start := date_trunc('month', coalesce(v_sub.current_period_start,now()));
  while v_start + interval '1 month' <= now() loop v_start := v_start + interval '1 month'; end loop;
  v_end := v_start + interval '1 month';

  select coalesce(sum(case when status='consumed' then credits else 0 end),0),
         coalesce(sum(case when status='reserved' then credits else 0 end),0)
    into v_consumed,v_reserved
  from public.ai_credit_ledger l
  where l.user_id=v_user_id and l.period_start=v_start and l.period_end=v_end;

  return query select v_sub.plan_key,v_allowance,v_consumed,v_reserved,greatest(v_allowance-v_consumed-v_reserved,0),v_start,v_end;
end;
$function$;

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
  select s.* into v_sub from public.ai_agent_subscriptions s where s.user_id=v_user_id and s.status in ('active','non_renewing','attention') and s.current_period_start <= now() and s.current_period_end > now() order by s.updated_at desc limit 1 for update;
  if not found then return query select false,'no_active_ai_subscription',null::uuid,0,0,0,0,0,now(),now(),null::text; return; end if;
  select p.* into v_plan from public.ai_agent_subscription_plans p where p.plan_key=v_sub.plan_key and p.active=true;
  if not found then return query select false,'subscription_plan_unavailable',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
  if v_op.agent_key is not null and not (v_op.agent_key=any(v_plan.included_agents)) then return query select false,'agent_not_in_plan',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
  select l.* into v_existing from public.ai_credit_ledger l where l.user_id=v_user_id and l.idempotency_key=v_key limit 1;
  if found then
    if v_existing.status='released' or v_existing.operation_key<>p_operation_key or v_existing.period_end<=now() or v_existing.subscription_id<>v_sub.id then return query select false,'idempotency_key_not_reusable',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
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

CREATE OR REPLACE FUNCTION public.get_my_ai_subscription()
 RETURNS TABLE(subscription_id uuid, plan_key text, plan_name text, billing_interval text, status text, amount numeric, currency text, monthly_credits integer, included_agents text[], current_period_end timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select s.id, s.plan_key, p.name, s.billing_interval, s.status, s.amount, s.currency,
         p.monthly_credits, p.included_agents, s.current_period_end
  from public.ai_agent_subscriptions s
  join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
  where s.user_id=(select auth.uid())
    and s.status in ('active','non_renewing','attention')
    and s.current_period_start <= now() and s.current_period_end > now()
  order by s.created_at desc
  limit 1
$function$;

revoke execute on function public.get_my_ai_subscription() from public,anon;
grant execute on function public.get_my_ai_subscription() to authenticated;
CREATE OR REPLACE FUNCTION public.request_ai_agent_execution(p_agent_key text, p_workflow_key text DEFAULT NULL::text, p_trigger_source text DEFAULT 'manual'::text, p_input_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=auth.uid();
 role_name text;
 a public.ai_agent_registry%rowtype;
 w public.ai_agent_workflows%rowtype;
 req uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if u is null or role_name is null or role_name not in ('admin','staff','coach','client') then
   raise exception 'Authorized CareerDev Global access required';
 end if;
 select * into a from public.ai_agent_registry where agent_key=p_agent_key and active=true;
 if not found then raise exception 'Active AI agent not found'; end if;
 if a.owner_role in ('staff','admin') and role_name not in ('staff','admin') then
   raise exception 'This staff/admin agent is restricted to Staff/Admin access';
 end if;
 if a.owner_role='client_coach' and role_name in ('coach','client') and not exists (
   select 1 from public.ai_agent_subscriptions s
   join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
   where s.user_id=u and s.status in ('active','non_renewing','attention')
     and s.current_period_start <= now() and s.current_period_end > now()
     and p.active=true and a.agent_key = any(p.included_agents)
 ) then raise exception 'An active CareerDev AI Agent subscription is required for this agent'; end if;
 if p_workflow_key is not null then
   select * into w from public.ai_agent_workflows where agent_id=a.id and workflow_key=p_workflow_key and active=true order by version desc limit 1;
   if not found then raise exception 'Active workflow not found for agent'; end if;
 end if;
 insert into public.ai_agent_execution_requests(agent_id,workflow_id,requested_by,trigger_source,input_payload,status,authorized_at)
 values(a.id,case when w.id is null then null else w.id end,u,p_trigger_source,coalesce(p_input_payload,'{}'::jsonb),'authorized',now())
 returning id into req;
 insert into public.ai_agent_execution_events(request_id,event_type,event_data,actor_id)
 values(req,'requested',jsonb_build_object('agent_key',a.agent_key,'workflow_key',p_workflow_key),u),
       (req,'authorized',jsonb_build_object('autonomy_level',a.autonomy_level,'human_approval_required',a.human_approval_required),u);
 return req;
end;
$function$;



CREATE OR REPLACE FUNCTION public.get_my_ai_agent_access(p_agent_key text)
 RETURNS TABLE(allowed boolean, plan_key text, plan_name text, status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  u uuid := auth.uid();
  role_name text;
begin
  select p.role into role_name
  from public.profiles p
  where p.id=u and p.status='active';

  if u is null or role_name is null then raise exception 'Active account required'; end if;
  if role_name in ('staff','admin') then
    return query
    select true, null::text, 'Staff/Admin Full Access'::text, 'privileged'::text;
    return;
  end if;

  return query
  select exists(
    select 1
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and s.current_period_start<=now() and s.current_period_end>now()
      and p_agent_key = any(p.included_agents)
      and p.active=true
  ),
  (
    select s.plan_key
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and s.current_period_start<=now() and s.current_period_end>now()
    order by s.created_at desc limit 1
  ),
  (
    select p.name
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and p.active=true
    order by s.created_at desc limit 1
  ),
  (
    select s.status
    from public.ai_agent_subscriptions s
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and s.current_period_start<=now() and s.current_period_end>now()
    order by s.created_at desc limit 1
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_human_coach_review(p_title text, p_original_request text, p_objective text, p_target_role text DEFAULT NULL::text, p_target_organization text DEFAULT NULL::text, p_target_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_user uuid := auth.uid(); v_plan text; v_limit integer; v_used integer; v_start date := date_trunc('month', now())::date; v_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date; v_request_id uuid; begin if v_user is null then raise exception 'Authentication required'; end if; perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':human_coach_review:' || v_start::text,0)); select s.plan_key into v_plan from public.ai_agent_subscriptions s where s.user_id=v_user and s.status in ('active','non_renewing','attention') and s.current_period_start<=now() and s.current_period_end>now() order by s.current_period_end desc limit 1; if v_plan is null then raise exception 'An active subscription is required'; end if; select e.monthly_quantity into v_limit from public.ai_plan_service_entitlements e where e.plan_key=v_plan and e.feature_key='human_coach_review' and e.enabled=true and e.availability_status='available'; if v_limit is null then raise exception 'Human Coach Review is not included in your plan'; end if; select coalesce(sum(quantity),0) into v_used from public.ai_plan_service_usage where user_id=v_user and feature_key='human_coach_review' and period_start=v_start and period_end=v_end; if v_used >= v_limit then raise exception 'Your monthly Human Coach Review allowance has been used'; end if; insert into public.service_requests(client_id,title,original_request,objective,target_role,target_organization,target_country,priority,status,created_at,updated_at) values(v_user,p_title,p_original_request,p_objective,p_target_role,p_target_organization,p_target_country,'standard','pending',now(),now()) returning id into v_request_id; insert into public.ai_plan_service_usage(user_id,feature_key,period_start,period_end,quantity,service_request_id) values(v_user,'human_coach_review',v_start,v_end,1,v_request_id); return jsonb_build_object('allowed',true,'request_id',v_request_id,'plan_key',v_plan,'monthly_limit',v_limit,'used',v_used+1,'remaining',v_limit-v_used-1); end; $function$;


-- Only the trusted runtime may claim and settle an operation. Customers cannot release their own charge.
alter table public.ai_credit_ledger add column runtime_claimed_at timestamptz;
do $$ begin
 if to_regprocedure('public.finalize_ai_credit_charge(uuid,text,jsonb)') is not null then
  revoke execute on function public.finalize_ai_credit_charge(uuid,text,jsonb) from public,anon,authenticated;
 end if;
end; $$;
create or replace function public.claim_ai_runtime_credit(p_ledger_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 update public.ai_credit_ledger set runtime_claimed_at=now(),updated_at=now()
 where id=p_ledger_id and user_id=p_user_id and status='reserved' and runtime_claimed_at is null;
 get diagnostics n=row_count;return n=1;
end;
$$;
create or replace function public.settle_ai_credit_charge(p_ledger_id uuid,p_user_id uuid,p_outcome text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.ai_credit_ledger%rowtype;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_outcome is null or p_outcome not in ('consumed','released') then raise exception 'Invalid settlement outcome'; end if;
 select * into v_row from public.ai_credit_ledger where id=p_ledger_id and user_id=p_user_id for update;
 if not found or v_row.runtime_claimed_at is null then raise exception 'Owned claimed credit reservation required'; end if;
 if v_row.status<>'reserved' then return jsonb_build_object('status',v_row.status,'duplicate',true); end if;
 update public.ai_credit_ledger set status=p_outcome,metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=p_ledger_id;
 return jsonb_build_object('status',p_outcome,'duplicate',false);
end;
$$;
revoke all on function public.claim_ai_runtime_credit(uuid,uuid),public.settle_ai_credit_charge(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_ai_runtime_credit(uuid,uuid),public.settle_ai_credit_charge(uuid,uuid,text,jsonb) to service_role;

-- Backend rollout gate. Enable only after required acceptance evidence passes.
create table public.ai_billing_release_config(id boolean primary key default true check(id),self_service_enabled boolean not null default false);
insert into public.ai_billing_release_config(id,self_service_enabled) values(true,false);
alter table public.ai_billing_release_config enable row level security;
revoke all on public.ai_billing_release_config from public,anon,authenticated;
grant select on public.ai_billing_release_config to authenticated;
grant all on public.ai_billing_release_config to service_role;
create policy ai_billing_release_read on public.ai_billing_release_config for select to authenticated using(true);

create or replace function public.get_my_ai_billing_history()
returns table(paid_at timestamptz,amount_minor bigint,currency text,period_start timestamptz,period_end timestamptz)
language sql stable security definer set search_path='' as $$
 select p.paid_at,p.amount_minor,p.currency,p.period_start,p.period_end from public.ai_subscription_payments p
 join public.ai_agent_subscriptions s on s.id=p.subscription_id
 where s.user_id=(select auth.uid()) order by p.paid_at desc limit 50;
$$;
revoke all on function public.get_my_ai_billing_history() from public,anon;
grant execute on function public.get_my_ai_billing_history() to authenticated;
