-- Disposable database only; surround with BEGIN/ROLLBACK.
begin;
create function pg_temp.test_ai_replacement_overlap() returns jsonb language plpgsql as $$
declare u uuid; p public.ai_agent_subscription_plans%rowtype; s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();e uuid; payment jsonb;blocked boolean;ended timestamptz:=now()-interval '1 minute';
begin
 select fixture_profile.id into u from public.profiles fixture_profile where fixture_profile.role='client' and fixture_profile.status='active'
 and not exists(select 1 from public.ai_billing_operations o where o.user_id=fixture_profile.id and o.status<>'confirmed') limit 1;
 if u is null then raise exception 'An isolated client fixture with no pending billing operation is required'; end if;
 select * into p from public.ai_agent_subscription_plans where active order by monthly_credits limit 1;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 -- All changes, including unrelated fixture status isolation, roll back.
 update public.ai_agent_subscriptions set status='expired' where user_id=u;
 insert into public.ai_agent_subscriptions(id,user_id,plan_key,billing_interval,status,currency,amount,paystack_plan_code,paystack_subscription_code,paystack_transaction_reference) values
 (s1,u,p.plan_key,'monthly','pending','USD',p.monthly_price,'PLN_overlap','SUB_rollback_overlap1','CDG-AI-rollback-overlap1'),
 (s2,u,p.plan_key,'monthly','pending','USD',p.monthly_price,'PLN_overlap','SUB_rollback_overlap2','CDG-AI-rollback-overlap2');
 payment:=jsonb_build_object('reference','CDG-AI-rollback-overlap1','status','success','transaction_id','rollback-overlap-tx1','amount_minor',round(p.monthly_price*100),'currency','USD','paid_at',now()-interval '2 minutes','period_start',now()-interval '2 minutes','period_end',now()+interval '20 days','subscription_code','SUB_rollback_overlap1','customer_code','CUS_overlap','plan_code','PLN_overlap');
 insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,subscription_id,transaction_reference,payload_hash,payload,verified_payment) values
 ('rollback-overlap:initial','charge.success',true,'verified',s1,'CDG-AI-rollback-overlap1','overlap-hash',jsonb_build_object('event','charge.success','data',jsonb_build_object('reference','CDG-AI-rollback-overlap1')),payment) returning id into e;
 perform public.apply_ai_subscription_webhook_state(e);
 update public.ai_agent_subscriptions set status='non_renewing',current_period_end=ended where id=s1;
 insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,subscription_id,transaction_reference,payload_hash,payload,verified_payment) values
 ('rollback-overlap:replacement','charge.success',true,'verified',s2,'CDG-AI-rollback-overlap2','overlap-hash2',jsonb_build_object('event','charge.success','data',jsonb_build_object('reference','CDG-AI-rollback-overlap2')),payment||jsonb_build_object('reference','CDG-AI-rollback-overlap2','transaction_id','rollback-overlap-tx2','period_start',now(),'period_end',now()+interval '25 days','subscription_code','SUB_rollback_overlap2')) returning id into e;
 perform public.apply_ai_subscription_webhook_state(e);
 insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,subscription_id,transaction_reference,payload_hash,payload,verified_payment) values
 ('rollback-overlap:historical-replay','charge.success',true,'verified',s1,'CDG-AI-rollback-overlap1','overlap-hash3',jsonb_build_object('event','charge.success','data',jsonb_build_object('reference','CDG-AI-rollback-overlap1')),payment) returning id into e;
 perform public.apply_ai_subscription_webhook_state(e);
 if (select current_period_end from public.ai_agent_subscriptions where id=s1)<>ended then raise exception 'Historical receipt replay revived old paid period'; end if;
 -- A newly verified old-subscription payment must not create overlapping access either.
 insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,subscription_id,transaction_reference,payload_hash,payload,verified_payment) values
 ('rollback-overlap:late-renewal','charge.success',true,'verified',s1,'CDG-AI-rollback-overlap-late','overlap-hash4',jsonb_build_object('event','charge.success','data',jsonb_build_object('subscription_code','SUB_rollback_overlap1')),payment||jsonb_build_object('reference','CDG-AI-rollback-overlap-late','transaction_id','rollback-overlap-tx3','period_start',now(),'period_end',now()+interval '28 days')) returning id into e;
 blocked:=false;begin perform public.apply_ai_subscription_webhook_state(e);exception when others then blocked:=true;end;
 if not blocked or exists(select 1 from public.ai_subscription_payments where reference='CDG-AI-rollback-overlap-late') then raise exception 'Overlapping paid replacement was not quarantined atomically'; end if;
 if (select count(*) from public.ai_agent_subscriptions where user_id=u and status in ('active','non_renewing','attention') and current_period_end>now())<>1 then raise exception 'Multiple currently paid subscriptions'; end if;
 if public.begin_ai_subscription_cancellation(u,null)->>'subscription_id' is distinct from s2::text then raise exception 'Replacement cancellation selected expired subscription'; end if;
 return '[{"name":"historical receipt cannot revive prior paid period","status":"pass"},{"name":"late payment overlap requires reconciliation with no receipt side effects","status":"pass"},{"name":"one current paid subscription after replacement","status":"pass"},{"name":"cancellation selects current replacement despite expired history","status":"pass"}]'::jsonb;
end;$$;
select pg_temp.test_ai_replacement_overlap() as results;
rollback;
