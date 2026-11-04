-- Named isolated project only. No gate activation; all fixture changes roll back.
begin;
create function pg_temp.check_ack_security() returns jsonb language plpgsql as $$
declare actor uuid; event_id uuid; denied boolean:=false;
begin
 select id into actor from public.profiles where role in ('admin','staff') and status='active' limit 1;
 select id into event_id from public.ai_agent_subscription_webhook_events limit 1;
 if actor is null or event_id is null then raise exception 'Isolated operator and retained event required'; end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 update public.profiles set status='suspended' where id=actor;
 begin
  perform public.reconcile_ai_subscription_event(event_id,actor,'Rollback-only suspended operator boundary');
 exception when others then
  if sqlerrm='Active operator required' then denied:=true; else raise; end if;
 end;
 if not denied then raise exception 'Suspended operator was accepted'; end if;
 denied:=false;
 begin
  perform public.apply_ai_payment_adjustment(actor,'Rollback-only disabled refund policy boundary','{}'::jsonb);
 exception when others then
  if sqlerrm='Refund policy disabled' then denied:=true; else raise; end if;
 end;
 if not denied then raise exception 'Disabled refund gate was bypassed'; end if;
 return '{"suspended_operator":"pass","disabled_refund_gate":"pass"}'::jsonb;
end;$$;
select pg_temp.check_ack_security() as results;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select id from public.profiles where role='client' and status='active' limit 1))::text,true);
set local role authenticated;
select jsonb_build_object(
 'cross_owner_subscriptions_hidden',(select count(*)=0 from public.ai_agent_subscriptions where user_id<>(select auth.uid())),
 'cross_owner_credit_ledger_hidden',(select count(*)=0 from public.ai_credit_ledger where user_id<>(select auth.uid()))
) as rls_results;
reset role;
rollback;
