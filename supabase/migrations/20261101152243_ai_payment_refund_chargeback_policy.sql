-- Policy core. Disabled by default; integration acceptance is required before activation.
-- No historical credit attribution is inferred or rewritten by this migration.
create table public.ai_refund_policy_config(id boolean primary key default true check(id),enabled boolean not null default false);
insert into public.ai_refund_policy_config values(true,false);
create table public.ai_payment_credit_lots(
 id uuid primary key default gen_random_uuid(),
 payment_reference text not null references public.ai_subscription_payments(reference),
 user_id uuid not null references public.profiles(id),
 period_start timestamptz not null,period_end timestamptz not null,
 allowance integer not null check(allowance>=0),
 frozen boolean not null default false,revoked boolean not null default false,
 unique(payment_reference,period_start),check(period_end>period_start)
);
alter table public.ai_credit_ledger add column payment_credit_lot_id uuid references public.ai_payment_credit_lots(id);
create index ai_credit_ledger_payment_lot_idx on public.ai_credit_ledger(payment_credit_lot_id);
create table public.ai_payment_adjustments(
 id uuid primary key default gen_random_uuid(),
 payment_reference text not null references public.ai_subscription_payments(reference),
 provider_object_id text not null,
 action text not null check(action in ('refund','dispute_open','dispute_won','dispute_lost')),
 amount_minor bigint not null check(amount_minor>=0),
 actor_id uuid not null references public.profiles(id),reason text not null,
 evidence jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 unique(provider_object_id,action)
);
create index ai_payment_adjustments_reference_idx on public.ai_payment_adjustments(payment_reference);
alter table public.ai_refund_policy_config enable row level security;
alter table public.ai_payment_credit_lots enable row level security;
alter table public.ai_payment_adjustments enable row level security;
revoke all on public.ai_refund_policy_config,public.ai_payment_credit_lots,public.ai_payment_adjustments from public,anon,authenticated;
grant select,update on public.ai_refund_policy_config to service_role;
grant select,insert on public.ai_payment_adjustments to service_role;
grant select,insert,update on public.ai_payment_credit_lots to service_role;

-- Input is a server-normalized, provider-verified contract, never browser claims.
-- This RPC is intentionally unavailable to authenticated customers and staff browsers.
create function public.apply_ai_payment_adjustment(p_actor uuid,p_reason text,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.ai_subscription_payments%rowtype; u uuid; old public.ai_payment_adjustments%rowtype;
 a text:=p_evidence->>'action'; obj text:=p_evidence->>'provider_object_id'; amount bigint;
 total bigint; result jsonb; permanent boolean; v_frozen boolean;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if not exists(select 1 from public.ai_refund_policy_config where id and enabled) then raise exception 'Refund policy disabled'; end if;
 if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('admin','staff')) or p_reason is null or length(trim(p_reason))<10 then raise exception 'Active operator and audit reason required'; end if;
 if a is null or a not in ('refund','dispute_open','dispute_won','dispute_lost') or nullif(obj,'') is null or p_evidence->>'verification_source' is distinct from 'provider_api' then raise exception 'Verified provider evidence required'; end if;
 select * into p from public.ai_subscription_payments where reference=p_evidence->>'reference';
 if not found then raise exception 'Exact payment required'; end if;
 select user_id into u from public.ai_agent_subscriptions where id=p.subscription_id;
 perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||u::text,0));
 select * into p from public.ai_subscription_payments where reference=p.reference for update;
 if p.provider_transaction_id is distinct from p_evidence->>'transaction_id' or p.currency is distinct from p_evidence->>'currency' then raise exception 'Conflicting payment identity'; end if;
 amount:=(p_evidence->>'amount_minor')::bigint;
 if amount is null or amount<0 or amount>p.amount_minor or (a='refund' and amount=0) then raise exception 'Invalid adjustment amount'; end if;
 select * into old from public.ai_payment_adjustments where provider_object_id=obj and action=a;
 if found then
  if old.payment_reference<>p.reference or old.amount_minor<>amount or old.evidence<>p_evidence then raise exception 'Conflicting adjustment identity'; end if;
  return old.result||jsonb_build_object('duplicate',true);
 end if;
 if exists(select 1 from public.ai_payment_adjustments where provider_object_id=obj and payment_reference<>p.reference) then raise exception 'Provider object belongs to another payment'; end if;
 if a in ('dispute_won','dispute_lost') and exists(select 1 from public.ai_payment_adjustments where provider_object_id=obj and action in ('dispute_won','dispute_lost') and action<>a) then raise exception 'Conflicting final dispute outcome requires review'; end if;
 if a='dispute_open' and exists(select 1 from public.ai_payment_adjustments where provider_object_id=obj and action in ('dispute_won','dispute_lost')) then
  result:=jsonb_build_object('processed',true,'stale',true);
 else
  -- Missing or mixed provenance must be reconciled explicitly, never guessed.
  if not exists(select 1 from public.ai_payment_credit_lots where payment_reference=p.reference) or exists(select 1 from public.ai_credit_ledger where subscription_id=p.subscription_id and payment_credit_lot_id is null and status in ('reserved','consumed')) then raise exception 'Payment credit attribution requires review'; end if;
  select coalesce(sum(amount_minor),0) into total from public.ai_payment_adjustments where payment_reference=p.reference and action='refund';
  if a='refund' then total:=total+amount; end if;
  if total>p.amount_minor then raise exception 'Cumulative refund exceeds payment'; end if;
  permanent:=total=p.amount_minor or a='dispute_lost' or exists(select 1 from public.ai_payment_adjustments where payment_reference=p.reference and action='dispute_lost');
  v_frozen:=a='dispute_open' or exists(select 1 from public.ai_payment_adjustments d where d.payment_reference=p.reference and d.action='dispute_open' and not (a='dispute_won' and d.provider_object_id=obj) and not exists(select 1 from public.ai_payment_adjustments r where r.provider_object_id=d.provider_object_id and r.action in ('dispute_won','dispute_lost')));
  update public.ai_payment_credit_lots set revoked=revoked or permanent,frozen=not permanent and v_frozen where payment_reference=p.reference;
  result:=jsonb_build_object('processed',true,'duplicate',false,'revoked',permanent,'frozen',not permanent and v_frozen,'administrator_review',a='refund' and total<p.amount_minor);
 end if;
 insert into public.ai_payment_adjustments(payment_reference,provider_object_id,action,amount_minor,actor_id,reason,evidence,result) values(p.reference,obj,a,amount,p_actor,trim(p_reason),p_evidence,result);
 return result;
end; $$;
revoke all on function public.apply_ai_payment_adjustment(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_ai_payment_adjustment(uuid,text,jsonb) to service_role;

create function public.guard_ai_payment_credit_lot() returns trigger
language plpgsql security definer set search_path='' as $$
declare lot public.ai_payment_credit_lots%rowtype; spent integer;
begin
 if tg_op='UPDATE' and (new.payment_credit_lot_id is distinct from old.payment_credit_lot_id or new.credits<>old.credits or new.user_id<>old.user_id or new.subscription_id<>old.subscription_id or new.period_start<>old.period_start or new.period_end<>old.period_end) then raise exception 'Credit attribution is immutable'; end if;
 if new.payment_credit_lot_id is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||new.user_id::text,0));
 select * into lot from public.ai_payment_credit_lots where id=new.payment_credit_lot_id for update;
 if lot.user_id<>new.user_id or lot.period_start<>new.period_start or lot.period_end<>new.period_end or not exists(select 1 from public.ai_subscription_payments where reference=lot.payment_reference and subscription_id=new.subscription_id) then raise exception 'Conflicting credit attribution'; end if;
 if tg_op='UPDATE' and old.status in ('consumed','released') and new.status<>old.status then raise exception 'Settled usage history is immutable'; end if;
 if new.status in ('reserved','consumed') then
  if lot.frozen or lot.revoked then raise exception 'Payment credits unavailable'; end if;
  select coalesce(sum(credits),0) into spent from public.ai_credit_ledger where payment_credit_lot_id=lot.id and id<>new.id and status in ('reserved','consumed');
  if spent+new.credits>lot.allowance then raise exception 'Payment credit allowance exceeded'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.guard_ai_payment_credit_lot() from public,anon,authenticated;
create trigger guard_ai_payment_credit_lot before insert or update on public.ai_credit_ledger for each row execute function public.guard_ai_payment_credit_lot();

-- Only new verified payment receipts produce attributed allowances. No historical backfill.
create function public.allocate_ai_payment_credit_lots() returns trigger
language plpgsql security definer set search_path='' as $$
declare u uuid; credits integer; bucket timestamptz;
begin
 select s.user_id,p.monthly_credits into u,credits from public.ai_agent_subscriptions s join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key where s.id=new.subscription_id;
 if credits is null then raise exception 'Approved payment allowance required'; end if;
 bucket:=date_trunc('month',new.period_start);
 while bucket<new.period_end loop
  insert into public.ai_payment_credit_lots(payment_reference,user_id,period_start,period_end,allowance) values(new.reference,u,bucket,bucket+interval '1 month',credits);
  bucket:=bucket+interval '1 month';
 end loop;
 return new;
end; $$;
revoke all on function public.allocate_ai_payment_credit_lots() from public,anon,authenticated;
create trigger allocate_ai_payment_credit_lots after insert on public.ai_subscription_payments for each row execute function public.allocate_ai_payment_credit_lots();

create function public.ai_payment_access_allowed(p_subscription_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.ai_refund_policy_config where id and enabled) or (
  (select count(*)=1 from public.ai_subscription_payments p where p.subscription_id=p_subscription_id and p.period_start<=now() and p.period_end>now())
  and exists(select 1 from public.ai_payment_credit_lots l join public.ai_subscription_payments p on p.reference=l.payment_reference join public.ai_agent_subscriptions s on s.id=p.subscription_id
   where p.subscription_id=p_subscription_id and (s.user_id=(select auth.uid()) or (select auth.role())='service_role') and p.period_start<=now() and p.period_end>now() and l.period_start<=now() and l.period_end>now() and not l.frozen and not l.revoked)
 );
$$;
revoke all on function public.ai_payment_access_allowed(uuid) from public,anon;
grant execute on function public.ai_payment_access_allowed(uuid) to authenticated,service_role;

-- Trigger ordering precedes the immutable-attribution guard. Caller-supplied lots must match.
create function public.attribute_ai_payment_credit_lot() returns trigger
language plpgsql security definer set search_path='' as $$
declare lot uuid;
begin
 if not exists(select 1 from public.ai_refund_policy_config where id and enabled) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||new.user_id::text,0));
 if not public.ai_payment_access_allowed(new.subscription_id) then raise exception 'Verified payment access required'; end if;
 select l.id into strict lot from public.ai_payment_credit_lots l join public.ai_subscription_payments p on p.reference=l.payment_reference
 where p.subscription_id=new.subscription_id and l.user_id=new.user_id and p.period_start<=now() and p.period_end>now() and l.period_start=new.period_start and l.period_end=new.period_end and not l.frozen and not l.revoked;
 if new.payment_credit_lot_id is not null and new.payment_credit_lot_id<>lot then raise exception 'Conflicting payment credit lot'; end if;
 if exists(select 1 from public.ai_credit_ledger where user_id=new.user_id and period_start=new.period_start and status in ('reserved','consumed') and payment_credit_lot_id is null) then raise exception 'Historical usage attribution requires review'; end if;
 new.payment_credit_lot_id:=lot;return new;
end; $$;
revoke all on function public.attribute_ai_payment_credit_lot() from public,anon,authenticated;
create trigger attribute_ai_payment_credit_lot before insert on public.ai_credit_ledger for each row execute function public.attribute_ai_payment_credit_lot();

-- Preserve existing RPC contracts; add the disabled payment-policy boundary.
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
    and public.ai_payment_access_allowed(ai_agent_subscriptions.id) and current_period_start <= now() and current_period_end > now()
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
  select s.* into v_sub from public.ai_agent_subscriptions s where s.user_id=v_user_id and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention') and s.current_period_start <= now() and s.current_period_end > now() order by s.updated_at desc limit 1 for update;
  if not found then return query select false,'no_active_ai_subscription',null::uuid,0,0,0,0,0,now(),now(),null::text; return; end if;
  select p.* into v_plan from public.ai_agent_subscription_plans p where p.plan_key=v_sub.plan_key and p.active=true;
  if not found then return query select false,'subscription_plan_unavailable',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
  if v_op.agent_key is not null and not (v_op.agent_key=any(v_plan.included_agents)) then return query select false,'agent_not_in_plan',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
  select l.* into v_existing from public.ai_credit_ledger l where l.user_id=v_user_id and l.idempotency_key=v_key limit 1;
  if found then
    if v_existing.status='released' or v_existing.operation_key<>p_operation_key or v_existing.execution_id is distinct from p_execution_id or v_existing.request_id is distinct from p_request_id or v_existing.agent_key is distinct from v_op.agent_key or v_existing.period_end<=now() or v_existing.subscription_id<>v_sub.id then return query select false,'idempotency_key_not_reusable',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
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
    and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention')
    and s.current_period_start <= now() and s.current_period_end > now()
  order by s.created_at desc
  limit 1
$function$;

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
   where s.user_id=u and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention')
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
      and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention')
      and s.current_period_start<=now() and s.current_period_end>now()
      and p_agent_key = any(p.included_agents)
      and p.active=true
  ),
  (
    select s.plan_key
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention')
      and s.current_period_start<=now() and s.current_period_end>now()
    order by s.created_at desc limit 1
  ),
  (
    select p.name
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention')
      and p.active=true
    order by s.created_at desc limit 1
  ),
  (
    select s.status
    from public.ai_agent_subscriptions s
    where s.user_id=u
      and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention')
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
AS $function$ declare v_user uuid := auth.uid(); v_plan text; v_limit integer; v_used integer; v_start date := date_trunc('month', now())::date; v_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date; v_request_id uuid; begin if v_user is null then raise exception 'Authentication required'; end if; perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':human_coach_review:' || v_start::text,0)); select s.plan_key into v_plan from public.ai_agent_subscriptions s where s.user_id=v_user and public.ai_payment_access_allowed(s.id) and s.status in ('active','non_renewing','attention') and s.current_period_start<=now() and s.current_period_end>now() order by s.current_period_end desc limit 1; if v_plan is null then raise exception 'An active subscription is required'; end if; select e.monthly_quantity into v_limit from public.ai_plan_service_entitlements e where e.plan_key=v_plan and e.feature_key='human_coach_review' and e.enabled=true and e.availability_status='available'; if v_limit is null then raise exception 'Human Coach Review is not included in your plan'; end if; select coalesce(sum(quantity),0) into v_used from public.ai_plan_service_usage where user_id=v_user and feature_key='human_coach_review' and period_start=v_start and period_end=v_end; if v_used >= v_limit then raise exception 'Your monthly Human Coach Review allowance has been used'; end if; insert into public.service_requests(client_id,title,original_request,objective,target_role,target_organization,target_country,priority,status,created_at,updated_at) values(v_user,p_title,p_original_request,p_objective,p_target_role,p_target_organization,p_target_country,'standard','pending',now(),now()) returning id into v_request_id; insert into public.ai_plan_service_usage(user_id,feature_key,period_start,period_end,quantity,service_request_id) values(v_user,'human_coach_review',v_start,v_end,1,v_request_id); return jsonb_build_object('allowed',true,'request_id',v_request_id,'plan_key',v_plan,'monthly_limit',v_limit,'used',v_used+1,'remaining',v_limit-v_used-1); end; $function$;
