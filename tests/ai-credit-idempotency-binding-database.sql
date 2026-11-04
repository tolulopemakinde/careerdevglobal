-- Isolated TEST only. Reuses only this task's tagged nonpayment fixture.
-- Claims, paid-term simulation, executions and all credit changes roll back.
begin;
create function pg_temp.test_credit_replay_binding() returns jsonb language plpgsql as $$
declare
 fixture public.ai_agent_subscriptions%rowtype;
 agent uuid; operation text; ex1 uuid; ex2 uuid; req1 uuid; req2 uuid; req3 uuid;
 first_res record; replay record; result jsonb; checks jsonb:='[]';
begin
 select * into fixture from public.ai_agent_subscriptions
 where id='fd310d20-d1b7-48e2-99b9-37219571407a'
 and status='pending' and metadata->>'acceptance_run'='billing-acknowledgment-20261103-a'
 and metadata->>'synthetic'='true' and metadata->>'no_provider_payment'='true'
 and paystack_customer_code is null and paystack_subscription_code is null;
 if not found or exists(select 1 from public.ai_subscription_payments where subscription_id=fixture.id)
 or exists(select 1 from public.ai_credit_ledger where user_id=fixture.user_id)
 or exists(select 1 from public.ai_billing_operations where user_id=fixture.user_id)
 then raise exception 'Verified isolated nonpayment fixture required'; end if;
 if (select self_service_enabled from public.ai_billing_release_config where id) is distinct from false
 or (select enabled from public.ai_refund_policy_config where id) is distinct from false
 then raise exception 'Both gates must remain disabled'; end if;
 select a.id,o.operation_key into agent,operation from public.ai_agent_registry a
 join public.ai_credit_operations o on o.agent_key=a.agent_key
 join public.ai_agent_subscription_plans p on p.plan_key=fixture.plan_key
 where a.active and o.active and o.credit_cost>0 and o.credit_cost<=p.monthly_credits and a.agent_key=any(p.included_agents)
 order by o.credit_cost,o.operation_key limit 1;
 if agent is null then raise exception 'Metered plan operation required'; end if;
 update public.ai_agent_subscriptions set status='active',current_period_start=now()-interval '1 minute',current_period_end=now()+interval '20 days' where id=fixture.id;
 insert into public.ai_agent_executions(agent_id,created_by) values(agent,fixture.user_id) returning id into ex1;
 insert into public.ai_agent_executions(agent_id,created_by) values(agent,fixture.user_id) returning id into ex2;
 insert into public.ai_agent_execution_requests(agent_id,requested_by,execution_id,status) values(agent,fixture.user_id,ex1,'prepared') returning id into req1;
 insert into public.ai_agent_execution_requests(agent_id,requested_by,execution_id,status) values(agent,fixture.user_id,ex2,'prepared') returning id into req2;
 insert into public.ai_agent_execution_requests(agent_id,requested_by,execution_id,status) values(agent,fixture.user_id,ex1,'prepared') returning id into req3;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',fixture.user_id)::text,true);
 execute 'set local role authenticated';
 if current_user<>'authenticated' then raise exception 'Authenticated SQL role required'; end if;
 select * into first_res from public.reserve_ai_credits(operation,ex1,req1,'rollback-credit-binding-20261104','{}');
 if first_res.allowed is distinct from true or first_res.reason<>'credits_reserved' then raise exception 'Initial reservation failed'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','authenticated initial reservation','status','pass'));
 select * into replay from public.reserve_ai_credits(operation,ex1,req1,'rollback-credit-binding-20261104','{}');
 if replay.allowed is distinct from true or replay.reason<>'idempotent_existing_request' or replay.ledger_id<>first_res.ledger_id then raise exception 'Same owned execution replay failed'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','same execution and request reuse one reservation','status','pass'));
 select * into replay from public.reserve_ai_credits(operation,ex2,req2,'rollback-credit-binding-20261104','{}');
 if replay.allowed is distinct from false or replay.reason<>'idempotency_key_not_reusable' then raise exception 'Different owned execution reused reservation'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','different owned execution denied','status','pass'));
 select * into replay from public.reserve_ai_credits(operation,ex1,req3,'rollback-credit-binding-20261104','{}');
 if replay.allowed is distinct from false or replay.reason<>'idempotency_key_not_reusable' then raise exception 'Different owned request reused reservation'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','different owned request denied','status','pass'));
 if (select count(*) from public.ai_credit_ledger where user_id=fixture.user_id)<>1
 or not exists(select 1 from public.ai_credit_ledger where id=first_res.ledger_id and execution_id=ex1 and request_id=req1 and status='reserved') then raise exception 'Original reservation changed'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','one unchanged original reservation','status','pass'));
 execute 'reset role';
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 if public.claim_ai_runtime_credit(first_res.ledger_id,fixture.user_id) is distinct from true
 or public.claim_ai_runtime_credit(first_res.ledger_id,fixture.user_id) is distinct from false then raise exception 'Runtime claim not exclusive'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','runtime claims reservation once','status','pass'));
 perform public.settle_ai_credit_charge(first_res.ledger_id,fixture.user_id,'consumed','{}');
 result:=public.settle_ai_credit_charge(first_res.ledger_id,fixture.user_id,'consumed','{}');
 if result->>'duplicate'<>'true' or (select count(*) from public.ai_credit_ledger where user_id=fixture.user_id)<>1 then raise exception 'Duplicate settlement changed credit count'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','duplicate settlement consumes once','status','pass'));
 return checks;
end;$$;
select pg_temp.test_credit_replay_binding() as results;
rollback;
