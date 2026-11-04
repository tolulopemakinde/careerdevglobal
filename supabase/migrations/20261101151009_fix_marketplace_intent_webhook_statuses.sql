-- Captured production function and status constraint on 2026-11-01; retain marketplace ledger behavior.
-- 'succeeded'/'refunded' are not legal payment-intent statuses. Use existing funded/reversed states.
CREATE OR REPLACE FUNCTION public.apply_paystack_webhook_state(p_webhook_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_event record;
 v_tx record;
 v_type text;
 v_new_payment text;
 v_new_release text;
 v_amount numeric;
 v_currency text;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into v_event from public.marketplace_payment_webhook_events where id=p_webhook_event_id for update;
 if not found then raise exception 'webhook_event_not_found'; end if;
 if v_event.provider_key <> 'paystack' then raise exception 'unsupported_provider'; end if;
 if v_event.signature_verified is not true then raise exception 'webhook_signature_not_verified'; end if;
 if v_event.processing_status='processed' then return jsonb_build_object('processed',true,'duplicate',true); end if;
 if v_event.transaction_id is null then raise exception 'transaction_reference_required'; end if;
 select * into v_tx from public.marketplace_transactions where id=v_event.transaction_id for update;
 if not found then raise exception 'transaction_not_found'; end if;
 v_type:=lower(trim(v_event.event_type));
 v_amount:=nullif((v_event.payload->'data'->>'amount')::numeric,0);
 v_currency:=coalesce(nullif(v_event.payload->'data'->>'currency',''),v_tx.currency);
 if v_amount is not null and v_amount <> round(v_tx.gross_amount*100) then raise exception 'payment_amount_mismatch'; end if;
 if upper(v_currency) <> upper(v_tx.currency) then raise exception 'payment_currency_mismatch'; end if;
 v_new_payment:=v_tx.payment_status;
 v_new_release:=v_tx.release_eligibility;
 case v_type
   when 'charge.success' then
     if v_tx.payment_status not in ('pending','authorized','funded','held') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment:='funded';
   when 'charge.failed' then
     if v_tx.payment_status in ('released','refunded','partially_refunded') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment:='failed'; v_new_release:='blocked';
   when 'refund.processed' then
     if v_tx.payment_status not in ('funded','held','partially_refunded','refunded') then raise exception 'invalid_refund_transition'; end if;
     v_new_payment:='refunded'; v_new_release:='blocked';
   else
     update public.marketplace_payment_webhook_events set processing_status='ignored',processed_at=now(),error_message=null where id=p_webhook_event_id;
     return jsonb_build_object('processed',false,'ignored',true,'event_type',v_type);
 end case;
 if v_new_payment='funded' and v_tx.fulfillment_status='completed' and v_tx.release_eligibility='blocked' then v_new_release:='eligible'; end if;
 if exists(select 1 from public.marketplace_payment_state_sync_events where webhook_event_id=p_webhook_event_id) then
   update public.marketplace_payment_webhook_events set processing_status='processed',processed_at=coalesce(processed_at,now()),error_message=null where id=p_webhook_event_id;
   return jsonb_build_object('processed',true,'duplicate',true);
 end if;
 insert into public.marketplace_payment_state_sync_events(webhook_event_id,transaction_id,normalized_event_type,previous_payment_status,new_payment_status,previous_release_eligibility,new_release_eligibility,applied_amount,currency)
 values(p_webhook_event_id,v_tx.id,case v_type when 'charge.success' then 'payment_succeeded' when 'charge.failed' then 'payment_failed' when 'refund.processed' then 'payment_refunded' end,v_tx.payment_status,v_new_payment,v_tx.release_eligibility,v_new_release,v_amount/100,v_currency);
 update public.marketplace_transactions set payment_status=v_new_payment,release_eligibility=v_new_release,provider_key='paystack',provider_transaction_reference=coalesce(nullif(v_event.payload->'data'->>'reference',''),provider_transaction_reference),updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_payment_webhook_event',p_webhook_event_id,'last_payment_webhook_type',v_type) where id=v_tx.id;
 insert into public.marketplace_transaction_events(transaction_id,event_type,actor_type,actor_id,event_data)
 values(v_tx.id,case v_type when 'charge.success' then 'funded' when 'charge.failed' then 'payment_failed' when 'refund.processed' then 'refunded' end,'payment_provider',null,jsonb_build_object('webhook_event_id',p_webhook_event_id,'provider_key','paystack','provider_event_reference',v_event.provider_event_reference,'amount',v_amount,'currency',v_currency));
 update public.marketplace_payment_webhook_events set processing_status='processed',processed_at=now(),error_message=null where id=p_webhook_event_id;
 update public.marketplace_payment_intents set status=case when v_type='charge.success' then 'funded' when v_type='charge.failed' then 'failed' when v_type='refund.processed' then 'reversed' else status end,updated_at=now() where transaction_id=v_tx.id;
 return jsonb_build_object('processed',true,'duplicate',false,'payment_status',v_new_payment,'transaction_id',v_tx.id);
end;
$function$;
revoke execute on function public.apply_paystack_webhook_state(uuid) from public,anon,authenticated;
grant execute on function public.apply_paystack_webhook_state(uuid) to service_role;
