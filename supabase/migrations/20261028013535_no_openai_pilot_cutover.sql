-- Release gate: apply only with tested runtime/checkout/verify/webhook deployments.
begin;
lock table public.ai_agent_subscription_plans, public.ai_agent_subscriptions,
  public.ai_agent_registry in share row exclusive mode;
do $$ begin
 if (select count(*) from public.ai_agent_subscription_plans where plan_key in ('fresher','starter','professional','career_pro','elite'))<>5 then
  raise exception 'Expected exactly five pilot plans';
 end if;
 if (select count(*) from public.ai_agent_registry where ai_dependency_mode='ai_required')<>12
 or (select count(*) from public.ai_agent_registry where ai_dependency_mode in ('works_without_ai','ai_optional'))<>11 then
  raise exception 'Agent classification changed; review pilot';
 end if;
 if exists(select 1 from public.ai_agent_subscriptions where status not in ('cancelled','canceled')) then
  raise exception 'Reconcile all pending and current subscriptions before cutover';
 end if;
end $$;
-- Private rollback snapshots; preserve subscriptions, prompts and execution histories.
create schema if not exists pilot_private;
revoke all on schema pilot_private from public,anon,authenticated;
create table pilot_private.no_openai_2026_backup as
 select 'plans'::text as kind,to_jsonb(p) as row_data from public.ai_agent_subscription_plans p
 union all select 'agents',jsonb_build_object('id',id,'active',active) from public.ai_agent_registry
 union all select 'services',to_jsonb(s) from public.ai_plan_service_entitlements s;
revoke all on pilot_private.no_openai_2026_backup from public,anon,authenticated;
with pilot(plan_key,um,uy,nm,ny) as (values
 ('fresher',2.99,29.90,4500,45000),('starter',4.99,49.90,7500,75000),
 ('professional',7.99,79.90,12000,120000),('career_pro',11.99,119.90,18000,180000),
 ('elite',14.99,149.90,22500,225000))
update public.ai_agent_subscription_plans p set monthly_price=v.um,annual_price=v.uy,
 monthly_price_ngn=v.nm,annual_price_ngn=v.ny,
 included_agents=array(select k from unnest(p.included_agents) k where exists(
 select 1 from public.ai_agent_registry a where a.agent_key=k and a.ai_dependency_mode in ('works_without_ai','ai_optional'))),
 description=case p.plan_key
 when 'fresher' then 'Structured assessment, skills and learning guidance with career discovery.'
 when 'starter' then 'Career foundations, structured coaching and education-to-work transition guidance.'
 when 'professional' then 'Structured professional development, job-search planning and research preparation.'
 when 'career_pro' then 'Professional pilot services plus structured talent-mobility planning.'
 else 'All 11 structured pilot agents, including employer and talent planning.' end || ' No AI generation or live research is included.',
 paystack_monthly_plan_code=null,paystack_annual_plan_code=null,
 paystack_monthly_plan_code_ngn=null,paystack_annual_plan_code_ngn=null,updated_at=now()
from pilot v where p.plan_key=v.plan_key;
update public.ai_agent_registry set active=false,updated_at=now() where ai_dependency_mode='ai_required';
update public.ai_plan_service_entitlements set enabled=false,updated_at=now()
where feature_key in ('advanced_career_intelligence','cross_border_career_intelligence');
-- Enforce the pause even for privileged RPC callers and pre-existing prepared requests.
create function public.enforce_no_openai_pilot_agent() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status not in ('failed','cancelled','canceled','rejected') and not exists(
  select 1 from public.ai_agent_registry a where a.id=new.agent_id and a.active
  and a.ai_dependency_mode in ('works_without_ai','ai_optional')) then
  raise exception 'Agent paused during no-OpenAI pilot' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.enforce_no_openai_pilot_agent() from public,anon,authenticated;
create trigger no_openai_pilot_request before insert or update on public.ai_agent_execution_requests
 for each row execute function public.enforce_no_openai_pilot_agent();
create trigger no_openai_pilot_execution before insert or update on public.ai_agent_executions
 for each row execute function public.enforce_no_openai_pilot_agent();
commit;
