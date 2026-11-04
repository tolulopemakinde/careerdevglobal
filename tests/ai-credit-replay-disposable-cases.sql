-- SQL integration assertions against the real draft reserve_ai_credits function
-- loaded into the ephemeral GitHub Actions PostgreSQL service.
-- Completely fictional UUIDs, no Supabase service credentials or real payment data.
BEGIN;
INSERT INTO public.profiles(id,role,status) VALUES
  ('00000000-0000-4000-8000-000000000001','client','active'),
  ('00000000-0000-4000-8000-000000000002','client','active');
INSERT INTO public.ai_agent_registry(id,agent_key) VALUES
  ('10000000-0000-4000-8000-000000000001','career_discovery_agent'),
  ('10000000-0000-4000-8000-000000000002','skills_gap_agent');
INSERT INTO public.ai_credit_operations(operation_key,active,agent_key,credit_cost) VALUES
  ('career_discovery_agent',true,'career_discovery_agent',1),
  ('skills_gap_agent',true,'skills_gap_agent',1);
INSERT INTO public.ai_agent_subscription_plans(plan_key,active,monthly_credits,included_agents) VALUES
  ('fixture_plan',true,30,ARRAY['career_discovery_agent','skills_gap_agent']);
INSERT INTO public.ai_agent_subscriptions(id,user_id,plan_key,status,current_period_start,current_period_end,updated_at) VALUES
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
   'fixture_plan','active',now()-interval '1 day',now()+interval '50 days',now());
INSERT INTO public.ai_agent_execution_requests(id,execution_id,requested_by,agent_id) VALUES
  ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');

DO $fixture_cases$
DECLARE
  v_initial record;
  v_repeat record;
  v_different_execution record;
  v_different_request record;
  v_different_agent record;
  v_payment_blocked record;
  v_rows integer;
  v_second_owner_rejected boolean:=false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('fixture.payment_allowed','true',true);
  SELECT * INTO v_initial FROM public.reserve_ai_credits(
    'career_discovery_agent','40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001','shared-idempotency-key','{}'::jsonb);
  IF v_initial.allowed IS DISTINCT FROM true OR v_initial.reason<>'credits_reserved'
     OR v_initial.ledger_id IS NULL THEN
    RAISE EXCEPTION 'SQL-FIXTURE: initial owned reservation failed';
  END IF;

  SELECT * INTO v_repeat FROM public.reserve_ai_credits(
    'career_discovery_agent','40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001','shared-idempotency-key','{}'::jsonb);
  IF v_repeat.allowed IS DISTINCT FROM true
     OR v_repeat.reason<>'idempotent_existing_request'
     OR v_repeat.ledger_id IS DISTINCT FROM v_initial.ledger_id THEN
    RAISE EXCEPTION 'SQL-FIXTURE: exact owned request must reuse its reservation';
  END IF;

  SELECT * INTO v_different_execution FROM public.reserve_ai_credits(
    'career_discovery_agent','40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002','shared-idempotency-key','{}'::jsonb);
  IF v_different_execution.allowed IS DISTINCT FROM false
     OR v_different_execution.reason<>'idempotency_key_not_reusable'
     OR v_different_execution.ledger_id IS NOT NULL THEN
    RAISE EXCEPTION 'SQL-FIXTURE: cross-execution reuse not denied';
  END IF;

  SELECT * INTO v_different_request FROM public.reserve_ai_credits(
    'career_discovery_agent','40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003','shared-idempotency-key','{}'::jsonb);
  IF v_different_request.allowed IS DISTINCT FROM false
     OR v_different_request.reason<>'idempotency_key_not_reusable' THEN
    RAISE EXCEPTION 'SQL-FIXTURE: cross-request reuse not denied';
  END IF;

  SELECT * INTO v_different_agent FROM public.reserve_ai_credits(
    'skills_gap_agent','40000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000004','shared-idempotency-key','{}'::jsonb);
  IF v_different_agent.allowed IS DISTINCT FROM false
     OR v_different_agent.reason<>'idempotency_key_not_reusable' THEN
    RAISE EXCEPTION 'SQL-FIXTURE: cross-agent reuse not denied';
  END IF;

  SELECT count(*) INTO v_rows FROM public.ai_credit_ledger;
  IF v_rows<>1 THEN
    RAISE EXCEPTION 'SQL-FIXTURE: duplicate ledger row created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_credit_ledger
    WHERE id=v_initial.ledger_id AND request_id='30000000-0000-4000-8000-000000000001'
      AND execution_id='40000000-0000-4000-8000-000000000001'
      AND status='reserved' AND credits=1
  ) THEN
    RAISE EXCEPTION 'SQL-FIXTURE: original ledger attribution changed';
  END IF;

  PERFORM set_config('fixture.payment_allowed','false',true);
  SELECT * INTO v_payment_blocked FROM public.reserve_ai_credits(
    'career_discovery_agent','40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001','another-idempotency-key','{}'::jsonb);
  IF v_payment_blocked.allowed IS DISTINCT FROM false
     OR v_payment_blocked.reason<>'no_active_ai_subscription' THEN
    RAISE EXCEPTION 'SQL-FIXTURE: payment entitlement guard was not enforced';
  END IF;
  PERFORM set_config('fixture.payment_allowed','true',true);

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  BEGIN
    PERFORM public.reserve_ai_credits(
      'career_discovery_agent','40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001','shared-idempotency-key','{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Owned matching agent execution required%' THEN
      v_second_owner_rejected:=true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_second_owner_rejected THEN
    RAISE EXCEPTION 'SQL-FIXTURE: unrelated user was able to reserve owned execution';
  END IF;
  RAISE NOTICE 'SQL-FIXTURE: exact retry, execution, request, agent, ledger, payment, and ownership checks PASSED';
END
$fixture_cases$;
ROLLBACK;
