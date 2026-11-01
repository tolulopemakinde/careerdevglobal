-- REVIEW ONLY. Do not apply to production until sandbox tests pass.
-- Atomically apply a verified AI subscription webhook event.
-- No customer identity is inferred from shared Paystack plan or customer codes.
create or replace function public.apply_ai_subscription_webhook_state(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_event public.ai_agent_subscription_webhook_events%rowtype;
  v_sub public.ai_agent_subscriptions%rowtype;
  v_code text;
  v_reference text;
  v_next text;
  v_paid text;
  v_next_date timestamptz;
  v_paid_date timestamptz;
  v_status text;
  v_sub_id uuid;
  v_by_ref uuid;
  v_by_code uuid;
  v_metadata jsonb;
begin
  if current_user <> 'service_role' and auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select * into v_event from public.ai_agent_subscription_webhook_events where id=p_event_id for update;
  if not found then raise exception 'Webhook event not found'; end if;
  if not v_event.signature_verified then raise exception 'Unsigned webhook event'; end if;
  if v_event.processing_status='processed' then return jsonb_build_object('processed',true,'duplicate',true); end if;
  if v_event.processing_status not in ('verified','failed','unmatched') then raise exception 'Invalid event state'; end if;
  v_reference:=nullif(v_event.transaction_reference,'');
  v_code:=nullif(coalesce(v_event.payload#>>'{data,subscription_code}',v_event.payload#>>'{data,subscription,subscription_code}'),'');
  if v_reference is not null then
    select id into strict v_by_ref from public.ai_agent_subscriptions where paystack_transaction_reference=v_reference;
  exception when no_data_found then v_by_ref:=null;
  end if;
  if v_code is not null then
    begin
      select id into strict v_by_code from public.ai_agent_subscriptions where paystack_subscription_code=v_code;
    exception when no_data_found then v_by_code:=null;
    end;
  end if;
  if v_by_ref is not null and v_by_code is not null and v_by_ref<>v_by_code then raise exception 'Conflicting provider identifiers'; end if;
  v_sub_id:=coalesce(v_by_ref,v_by_code);
  if v_sub_id is null then
    update public.ai_agent_subscription_webhook_events set processing_status='unmatched',error_message='No exact subscription match' where id=p_event_id;
    return jsonb_build_object('processed',false,'unmatched',true);
  end if;
  select * into v_sub from public.ai_agent_subscriptions where id=v_sub_id for update;
  v_status:=v_sub.status;
  v_next:=nullif(coalesce(v_event.payload#>>'{data,next_payment_date}',v_event.payload#>>'{data,subscription,next_payment_date}'),'');
  v_paid:=nullif(v_event.payload#>>'{data,paid_at}','');
  if v_next is not null then v_next_date:=v_next::timestamptz; end if;
  if v_paid is not null then v_paid_date:=v_paid::timestamptz; end if;
  if v_event.event_type='subscription.disable' and v_status not in ('cancelled','expired') then
    v_status:=case when v_sub.current_period_end>now() then 'non_renewing' else 'cancelled' end;
  elsif v_event.event_type='subscription.not_renew' and v_status not in ('cancelled','expired') then
    v_status:='non_renewing';
  elsif v_status not in ('cancelled','expired','non_renewing') then
    if v_event.event_type='invoice.payment_failed' or (v_event.event_type='invoice.update' and lower(v_event.payload#>>'{data,status}')='failed') then v_status:='attention';
    elsif v_event.event_type in ('charge.success','subscription.create') or (v_event.event_type='invoice.update' and lower(v_event.payload#>>'{data,status}') in ('paid','success')) then v_status:='active';
    end if;
  end if;
  v_metadata:=coalesce(v_sub.metadata,'{}'::jsonb)||jsonb_build_object('last_webhook_event',v_event.event_type,'last_webhook_event_reference',v_event.provider_event_reference);
  update public.ai_agent_subscriptions
  set status=v_status,
      paystack_subscription_code=coalesce(v_code,v_sub.paystack_subscription_code),
      current_period_end=case when v_status not in ('cancelled','expired') and v_next_date>coalesce(v_sub.current_period_end,'-infinity'::timestamptz) then v_next_date else v_sub.current_period_end end,
      current_period_start=case when v_status not in ('cancelled','expired') and v_paid_date>coalesce(v_sub.current_period_start,'-infinity'::timestamptz) then v_paid_date else v_sub.current_period_start end,
      metadata=v_metadata,updated_at=now()
  where id=v_sub_id;
  update public.ai_agent_subscription_webhook_events set processing_status='processed',subscription_id=v_sub_id,error_message=null,processed_at=now() where id=p_event_id;
  return jsonb_build_object('processed',true,'subscription_id',v_sub_id,'status',v_status);
end;
$$;
revoke all on function public.apply_ai_subscription_webhook_state(uuid) from public, anon, authenticated;
grant execute on function public.apply_ai_subscription_webhook_state(uuid) to service_role;
