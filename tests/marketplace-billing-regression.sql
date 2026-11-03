-- Disposable database only. Fixtures and all financial state changes roll back.
create temporary table if not exists marketplace_test_marker(id integer);
create or replace function pg_temp.run_marketplace_billing_regression() returns jsonb language plpgsql as $$
declare c uuid;coach uuid;coach_profile uuid;svc uuid;booking uuid;tx uuid;event_id uuid;result jsonb;results jsonb:='[]';
begin
 begin
  select id into c from public.clients limit 1;
  select id into coach_profile from public.profiles where role='coach' and status='active' limit 1;
  select id into svc from public.services where active limit 1;
  if c is null or coach_profile is null or svc is null then raise exception 'Marketplace role/catalog fixtures required'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  insert into public.coaches(profile_id) values(coach_profile) on conflict(profile_id) do update set profile_id=excluded.profile_id returning id into coach;
  insert into public.marketplace_booking_requests(client_id,coach_id,service_id) values(c,coach,svc) returning id into booking;
  insert into public.marketplace_transactions(booking_id,client_id,coach_id,service_id,currency,gross_amount,platform_share_pct,coach_share_pct,platform_fee,coach_earnings,provider_key,provider_transaction_reference)
  values(booking,c,coach,svc,'USD',10,20,80,2,8,'paystack','fixture-marketplace-payment') returning id into tx;
  insert into public.marketplace_payment_intents(transaction_id,provider_key,provider_intent_reference,amount,currency,idempotency_key)
  values(tx,'paystack','fixture-marketplace-payment',10,'USD','fixture-marketplace-intent');
  insert into public.marketplace_payment_webhook_events(provider_key,provider_event_reference,event_type,signature_verified,processing_status,transaction_id,payload_hash,payload)
  values('paystack','fixture-marketplace-success','charge.success',true,'verified',tx,'fixture-marketplace-hash',jsonb_build_object('event','charge.success','data',jsonb_build_object('reference','fixture-marketplace-payment','amount',1000,'currency','USD'))) returning id into event_id;
  result:=public.apply_paystack_webhook_state(event_id);
  if result->>'payment_status'<>'funded' or (select status from public.marketplace_payment_intents where transaction_id=tx)<>'funded' then raise exception 'Marketplace success state incorrect'; end if;
  results:=results||jsonb_build_array(jsonb_build_object('name','marketplace success with payment intent','status','pass'));
  result:=public.apply_paystack_webhook_state(event_id);
  if result->>'duplicate'<>'true' or (select count(*) from public.marketplace_payment_state_sync_events where transaction_id=tx)<>1 then raise exception 'Marketplace duplicate event changed ledger'; end if;
  results:=results||jsonb_build_array(jsonb_build_object('name','marketplace duplicate receipt','status','pass'));
  insert into public.marketplace_payment_webhook_events(provider_key,provider_event_reference,event_type,signature_verified,processing_status,transaction_id,payload_hash,payload)
  values('paystack','fixture-marketplace-refund','refund.processed',true,'verified',tx,'fixture-refund-hash',jsonb_build_object('event','refund.processed','data',jsonb_build_object('reference','fixture-marketplace-payment','amount',1000,'currency','USD'))) returning id into event_id;
  result:=public.apply_paystack_webhook_state(event_id);
  if result->>'payment_status'<>'refunded' or (select status from public.marketplace_payment_intents where transaction_id=tx)<>'reversed' then raise exception 'Marketplace refund state incorrect'; end if;
  if (select count(*) from public.marketplace_payment_state_sync_events where transaction_id=tx)<>2 then raise exception 'Marketplace refund ledger incorrect'; end if;
  results:=results||jsonb_build_array(jsonb_build_object('name','marketplace refund preserves intent constraint','status','pass'));
  raise exception using errcode='P0002',message='ROLLBACK_MARKETPLACE_FIXTURES';
 exception when no_data_found then if sqlerrm<>'ROLLBACK_MARKETPLACE_FIXTURES' then raise; end if; end;
 if exists(select 1 from public.marketplace_transactions where id=tx) then raise exception 'Marketplace fixture rollback failed'; end if;
 return results||jsonb_build_array(jsonb_build_object('name','marketplace fixture rollback','status','pass'));
end;
$$;
select pg_temp.run_marketplace_billing_regression() as results;
