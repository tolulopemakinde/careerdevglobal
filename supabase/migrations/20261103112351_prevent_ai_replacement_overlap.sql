-- Preserve exact payment matching; recorded receipts cannot grant a paid period twice.
create or replace function public.apply_ai_subscription_webhook_state(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.ai_agent_subscription_webhook_events%rowtype;
  v_sub public.ai_agent_subscriptions%rowtype;
  v_payment public.ai_subscription_payments%rowtype;
  v_ref text; v_code text; v_customer text; v_plan text;
  v_by_ref uuid; v_by_code uuid; v_id uuid; v_status text;
  v_start timestamptz; v_end timestamptz; v_paid timestamptz;
  v_new_payment boolean:=false;
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
      v_new_payment:=true;
      if v_status not in ('cancelled','expired') and exists(
        select 1 from public.ai_agent_subscriptions other where other.user_id=v_sub.user_id and other.id<>v_id
        and other.status in ('active','non_renewing','attention') and other.current_period_end>now() and other.current_period_start<v_end and other.current_period_end>v_start
      ) then raise exception 'Overlapping paid subscription requires reconciliation'; end if;
      insert into public.ai_subscription_payments(reference,subscription_id,provider_transaction_id,amount_minor,currency,paid_at,period_start,period_end)
      values(v_ref,v_id,v_tx,v_amount,v_currency,v_paid,v_start,v_end);
    end if;
    if v_new_payment and v_status not in ('cancelled','expired') then
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

create or replace function public.begin_ai_subscription_cancellation(p_user_id uuid,p_target_plan_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sub public.ai_agent_subscriptions%rowtype; v_op public.ai_billing_operations%rowtype;
 v_current public.ai_agent_subscription_plans%rowtype; v_target public.ai_agent_subscription_plans%rowtype; v_action text; v_target_price numeric;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and status='active' and role in ('client','coach')) then raise exception 'Active client or coach required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-billing:'||p_user_id::text,0));
 if (select count(*) from public.ai_agent_subscriptions where user_id=p_user_id and status in ('active','attention','non_renewing') and (status in ('active','attention') or current_period_end>now()))<>1 then raise exception 'Exactly one subscription required; contact billing support'; end if;
 select * into v_sub from public.ai_agent_subscriptions where user_id=p_user_id and status in ('active','attention','non_renewing') and (status in ('active','attention') or current_period_end>now()) for update;
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
revoke all on function public.begin_ai_subscription_cancellation(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_ai_subscription_cancellation(uuid,text) to service_role;
