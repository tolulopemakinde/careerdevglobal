-- Execute ONLY on a disposable database. All fixture writes roll back inside a subtransaction.
create temporary table if not exists billing_test_session_marker(id integer);
create or replace function pg_temp.billing_assert(p_ok boolean,p_label text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'BILLING TEST FAILED: %',p_label; end if; end;
$$;
create or replace function pg_temp.run_ai_billing_tests() returns jsonb language plpgsql as $$
declare
 u1 uuid; u2 uuid; op_user uuid; s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); e uuid;
 v_result jsonb; results jsonb:='[]'; payment jsonb; op jsonb; old_end timestamptz; n integer; blocked boolean;
 plan public.ai_agent_subscription_plans%rowtype; target public.ai_agent_subscription_plans%rowtype;
 agent_id uuid; execution_id uuid; request_id uuid; reservation record; credit_key text;
begin
 begin
  select id into u1 from public.profiles where role='client' and status='active' limit 1;
  select id into u2 from public.profiles where role='coach' and status='active' limit 1;
  select id into op_user from public.profiles where role in ('admin','staff') and status='active' limit 1;
  perform pg_temp.billing_assert(u1 is not null and u2 is not null and op_user is not null,'isolated role fixtures exist');
  select * into plan from public.ai_agent_subscription_plans where active order by monthly_credits limit 1;
  select * into target from public.ai_agent_subscription_plans where active and monthly_credits>plan.monthly_credits and included_agents @> plan.included_agents order by monthly_credits limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',op_user)::text,true);
  insert into public.ai_agent_subscriptions(id,user_id,plan_key,billing_interval,status,currency,amount,paystack_plan_code,paystack_subscription_code,paystack_customer_code,paystack_transaction_reference)
  values(s1,u1,plan.plan_key,'monthly','pending','USD',plan.monthly_price,'PLN_fixture','SUB_fixture_a','CUS_fixture_a','CDG-AI-fixture-a'),
        (s2,u2,plan.plan_key,'monthly','active','USD',plan.monthly_price,'PLN_fixture','SUB_fixture_b','CUS_fixture_b','CDG-AI-fixture-b');
  payment:=jsonb_build_object('reference','CDG-AI-fixture-a','status','success','transaction_id','fixture_tx_a','amount_minor',round(plan.monthly_price*100),'currency','USD','paid_at',now()-interval '1 minute','period_start',now()-interval '1 minute','period_end',now()+interval '20 days','subscription_code','SUB_fixture_a','customer_code','CUS_fixture_a','plan_code','PLN_fixture');
  insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,subscription_id,transaction_reference,payload_hash,payload,verified_payment)
  values('fixture:W01','charge.success',true,'verified',s1,'CDG-AI-fixture-a','fixture-hash',jsonb_build_object('event','charge.success','data',jsonb_build_object('reference','CDG-AI-fixture-a','subscription_code','SUB_fixture_a')),payment) returning id into e;
  v_result:=public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert(v_result->>'status'='active' and (select count(*)=1 from public.ai_subscription_payments where subscription_id=s1),'W01 verified activation');
  results:=results||jsonb_build_array(jsonb_build_object('id','W01','status','pass','layer','database'));
  v_result:=public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert((v_result->>'duplicate')::boolean and (select count(*)=1 from public.ai_subscription_payments where subscription_id=s1),'W04 committed retry');
  results:=results||jsonb_build_array(jsonb_build_object('id','W04','status','pass','layer','database'));
  insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,subscription_id,transaction_reference,payload_hash,payload,verified_payment)
  select 'fixture:W03',event_type,signature_verified,'verified',subscription_id,transaction_reference,payload_hash,payload,verified_payment from public.ai_agent_subscription_webhook_events where id=e returning id into e;
  perform public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert((select count(*)=1 from public.ai_subscription_payments where subscription_id=s1),'W03 interrupted record retry and semantic payment deduplication');
  results:=results||jsonb_build_array(jsonb_build_object('id','W03','status','pass','layer','database'));
  update public.ai_agent_subscription_webhook_events set processing_status='verified',payload=jsonb_set(payload,'{data,subscription_code}','"SUB_fixture_b"') where id=e;
  blocked:=false;begin perform public.apply_ai_subscription_webhook_state(e);exception when others then blocked:=true;end;
  perform pg_temp.billing_assert(blocked and (select status='active' from public.ai_agent_subscriptions where id=s2),'W05 conflicting customer identity');
  results:=results||jsonb_build_array(jsonb_build_object('id','W05','status','pass','layer','database'));
  blocked:=false;begin update public.ai_agent_subscriptions set paystack_subscription_code='SUB_fixture_a' where id=s2;exception when unique_violation then blocked:=true;end;
  perform pg_temp.billing_assert(blocked,'W06 duplicate subscription code rejected');
  results:=results||jsonb_build_array(jsonb_build_object('id','W06','status','pass','layer','database'));
  update public.ai_agent_subscription_webhook_events set payload=jsonb_set(payload,'{data,subscription_code}','"SUB_fixture_a"'),signature_verified=false where id=e;
  blocked:=false;begin perform public.apply_ai_subscription_webhook_state(e);exception when others then blocked:=true;end;
  perform pg_temp.billing_assert(blocked,'unsigned event denied by database');
  results:=results||jsonb_build_array(jsonb_build_object('id','unsigned-event','status','pass','layer','database'));
  update public.ai_agent_subscription_webhook_events set signature_verified=true where id=e;
  select current_period_end into old_end from public.ai_agent_subscriptions where id=s1;
  update public.ai_agent_subscriptions set status='cancelled' where id=s1;
  perform public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert((select status='cancelled' and current_period_end=old_end from public.ai_agent_subscriptions where id=s1),'W08 terminal state preserved');
  results:=results||jsonb_build_array(jsonb_build_object('id','W08','status','pass','layer','database'));
  update public.ai_agent_subscriptions set status='active' where id=s1;
  update public.ai_agent_subscription_webhook_events set processing_status='verified',transaction_reference='renewal-fixture-old',payload=jsonb_build_object('event','charge.success','data',jsonb_build_object('reference','renewal-fixture-old','subscription_code','SUB_fixture_a')),
    verified_payment=payment||jsonb_build_object('reference','renewal-fixture-old','transaction_id','fixture_tx_old','period_start',now()-interval '20 days','period_end',now()-interval '1 day','paid_at',now()-interval '20 days') where id=e;
  perform public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert((select current_period_end=old_end from public.ai_agent_subscriptions where id=s1),'W09 stale paid period');
  results:=results||jsonb_build_array(jsonb_build_object('id','W09','status','pass','layer','database'));
  update public.ai_agent_subscription_webhook_events set processing_status='verified',verified_payment=payment||jsonb_build_object('reference','renewal-fixture-old','period_end','invalid') where id=e;
  blocked:=false;begin perform public.apply_ai_subscription_webhook_state(e);exception when others then blocked:=true;end;
  perform pg_temp.billing_assert(blocked and (select current_period_end=old_end from public.ai_agent_subscriptions where id=s1),'W15 invalid date rolls back');
  results:=results||jsonb_build_array(jsonb_build_object('id','W15','status','pass','layer','database'));
  insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,payload_hash,payload)
  values('fixture:W14','subscription.create',true,'verified','unmatched-hash',jsonb_build_object('event','subscription.create','data',jsonb_build_object('customer',jsonb_build_object('customer_code','CUS_fixture_a'),'plan',jsonb_build_object('plan_code','PLN_fixture')))) returning id into e;
  v_result:=public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert((v_result->>'unmatched')::boolean,'W14 shared customer/plan cannot match');
  results:=results||jsonb_build_array(jsonb_build_object('id','W14','status','pass','layer','database'));
  op:=public.begin_ai_subscription_cancellation(u1,null);
  perform pg_temp.billing_assert(public.claim_ai_billing_operation((op->>'id')::uuid),'claim first cancellation');
  perform pg_temp.billing_assert(not public.claim_ai_billing_operation((op->>'id')::uuid),'duplicate provider claim prevented');
  perform public.finish_ai_subscription_cancellation((op->>'id')::uuid);
  perform pg_temp.billing_assert((select status='non_renewing' and current_period_end=old_end from public.ai_agent_subscriptions where id=s1),'W11 paid term retained');
  results:=results||jsonb_build_array(jsonb_build_object('id','W11','status','pass','layer','database'));
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u1)::text,true);
  perform pg_temp.billing_assert((select credits_remaining=plan.monthly_credits from public.get_my_ai_credit_status()),'cancelled renewal retains allowance');
  update public.ai_agent_subscriptions set current_period_start=now()-interval '1 month',current_period_end=now()-interval '1 second' where id=s1;
  perform pg_temp.billing_assert((select credits_remaining=0 from public.get_my_ai_credit_status()),'W12 expiry denies allowance');
  perform pg_temp.billing_assert((select allowed=false from public.get_my_ai_agent_access(plan.included_agents[1])),'W12 expiry denies agent');
  results:=results||jsonb_build_array(jsonb_build_object('id','W12','status','pass','layer','database'));
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',op_user)::text,true);
  update public.ai_agent_subscriptions set current_period_start=now()-interval '1 minute',current_period_end=old_end where id=s1;
  op:=public.begin_ai_subscription_cancellation(u1,target.plan_key);
  perform public.finish_ai_subscription_cancellation((op->>'id')::uuid);
  perform pg_temp.billing_assert((select plan_key=plan.plan_key and metadata->>'scheduled_upgrade_plan_key'=target.plan_key from public.ai_agent_subscriptions where id=s1),'W16 no upgrade entitlements before payment');
  blocked:=false;begin perform public.prepare_ai_subscription_checkout(u1,target.plan_key,'monthly','USD');exception when others then blocked:=true;end;
  perform pg_temp.billing_assert(blocked,'W16 checkout during paid term denied');
  results:=results||jsonb_build_array(jsonb_build_object('id','W16','status','pass','layer','database'));
  update public.ai_agent_subscriptions set status='active',current_period_start=now()-interval '1 minute',current_period_end=old_end where id=s1;
  select a.id,a.agent_key into agent_id,credit_key from public.ai_agent_registry a join public.ai_credit_operations o on o.agent_key=a.agent_key
   where a.active and o.active and a.agent_key=any(plan.included_agents) order by a.agent_key limit 1;
  perform pg_temp.billing_assert(agent_id is not null,'authoritative metered agent available');
  insert into public.ai_agent_executions(agent_id,created_by) values(agent_id,u1) returning id into execution_id;
  insert into public.ai_agent_execution_requests(agent_id,requested_by,execution_id,status) values(agent_id,u1,execution_id,'prepared') returning id into request_id;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u1)::text,true);
  select * into reservation from public.reserve_ai_credits(credit_key,execution_id,request_id,'fixture-meter-1','{}');
  perform pg_temp.billing_assert(reservation.allowed and reservation.credits_required>0,'server-calculated credit reservation');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u2)::text,true);
  blocked:=false;begin perform public.reserve_ai_credits(credit_key,execution_id,request_id,'fixture-cross-account','{}');exception when others then blocked:=true;end;
  perform pg_temp.billing_assert(blocked,'cross-account reservation denied');
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',op_user)::text,true);
  perform pg_temp.billing_assert(public.claim_ai_runtime_credit(reservation.ledger_id,u1),'runtime claims once');
  perform pg_temp.billing_assert(not public.claim_ai_runtime_credit(reservation.ledger_id,u1),'concurrent runtime claim blocked');
  perform public.settle_ai_credit_charge(reservation.ledger_id,u1,'consumed','{}');
  v_result:=public.settle_ai_credit_charge(reservation.ledger_id,u1,'consumed','{}');
  perform pg_temp.billing_assert((v_result->>'duplicate')::boolean,'duplicate settlement is idempotent');
  perform pg_temp.billing_assert(not has_function_privilege('authenticated','public.settle_ai_credit_charge(uuid,uuid,text,jsonb)','EXECUTE'),'client cannot release own charge');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u1)::text,true);
  perform pg_temp.billing_assert((select credits_remaining=plan.monthly_credits-reservation.credits_required from public.get_my_ai_credit_status()),'consumed credits deducted once');
  select * into reservation from public.reserve_ai_credits(credit_key,execution_id,request_id,'fixture-meter-failed','{}');
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',op_user)::text,true);
  perform public.claim_ai_runtime_credit(reservation.ledger_id,u1);
  perform public.settle_ai_credit_charge(reservation.ledger_id,u1,'released','{}');
  perform pg_temp.billing_assert((select status='released' from public.ai_credit_ledger where id=reservation.ledger_id),'failed operation releases reservation');
  results:=results||jsonb_build_array(jsonb_build_object('id','credit-reserve-consume-release','status','pass','layer','database'));
  update public.ai_agent_subscriptions set status='active',current_period_start=now()-interval '1 month',current_period_end=now()-interval '1 second' where id=s1;
  insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,transaction_reference,payload_hash,payload)
  values('fixture:W10-failed','invoice.payment_failed',true,'verified','CDG-AI-fixture-a','failure-hash',jsonb_build_object('event','invoice.payment_failed','data',jsonb_build_object('reference','CDG-AI-fixture-a','period_end',now(),'subscription_code','SUB_fixture_a'))) returning id into e;
  perform public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert((select status='attention' from public.ai_agent_subscriptions where id=s1),'failed renewal requires attention');
  insert into public.ai_agent_subscription_webhook_events(provider_event_reference,event_type,signature_verified,processing_status,transaction_reference,payload_hash,payload,verified_payment)
  values('fixture:W10-success','charge.success',true,'verified','renewal-fixture-good','renewal-hash',jsonb_build_object('event','charge.success','data',jsonb_build_object('reference','renewal-fixture-good','subscription_code','SUB_fixture_a')),payment||jsonb_build_object('reference','renewal-fixture-good','transaction_id','fixture_tx_renewal')) returning id into e;
  perform public.apply_ai_subscription_webhook_state(e);
  perform pg_temp.billing_assert((select status='active' and current_period_end=old_end from public.ai_agent_subscriptions where id=s1),'verified successful renewal restores paid period');
  results:=results||jsonb_build_array(jsonb_build_object('id','W10','status','pass','layer','database'));
  perform pg_temp.billing_assert(not has_function_privilege('authenticated','public.apply_ai_subscription_webhook_state(uuid)','EXECUTE') and not has_function_privilege('anon','public.apply_ai_subscription_webhook_state(uuid)','EXECUTE'),'untrusted direct reconciliation denied');
  perform pg_temp.billing_assert(not has_table_privilege('authenticated','public.ai_agent_subscriptions','TRUNCATE') and not has_table_privilege('anon','public.ai_credit_ledger','TRUNCATE'),'truncate grants removed');
  results:=results||jsonb_build_array(jsonb_build_object('id','direct-privileges','status','pass','layer','database'));
  raise exception using errcode='P0002',message='ROLLBACK_BILLING_FIXTURES';
 exception when no_data_found then
  if sqlerrm<>'ROLLBACK_BILLING_FIXTURES' then raise; end if;
 end;
 perform pg_temp.billing_assert(not exists(select 1 from public.ai_agent_subscriptions where id in (s1,s2)),'fixtures rolled back');
 return results||jsonb_build_array(jsonb_build_object('id','fixture-rollback','status','pass','layer','database'));
end;
$$;
select pg_temp.run_ai_billing_tests() as results;
