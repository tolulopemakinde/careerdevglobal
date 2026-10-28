-- PILOT CUTOVER: apply only after checkout runtime, governance and rollback tests pass.
-- Preserve all registry rows, execution history and subscription records.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.ai_agent_subscription_plans WHERE plan_key IN ('fresher','starter','professional','career_pro','elite')) <> 5 THEN
  RAISE EXCEPTION 'Expected exactly five pilot plans';
 END IF;
 IF EXISTS (SELECT 1 FROM public.ai_agent_subscriptions WHERE status IN ('active','non_renewing','attention')) THEN
  RAISE EXCEPTION 'Current subscriptions require reconciliation before pilot price cutover';
 END IF;
END $$;
WITH pilot(plan_key,usd_month,usd_year,ngn_month,ngn_year) AS (
 VALUES ('fresher',2.99,29.90,4500,45000),
 ('starter',4.99,49.90,7500,75000),
 ('professional',7.99,79.90,12000,120000),
 ('career_pro',11.99,119.90,18000,180000),
 ('elite',14.99,149.90,22500,225000)
)
UPDATE public.ai_agent_subscription_plans p
SET monthly_price=v.usd_month,annual_price=v.usd_year,
 monthly_price_ngn=v.ngn_month,annual_price_ngn=v.ngn_year,
 included_agents=ARRAY(SELECT unnest(p.included_agents) EXCEPT SELECT agent_key FROM public.ai_agent_registry WHERE ai_dependency_mode='ai_required'),
 paystack_monthly_plan_code=NULL,paystack_annual_plan_code=NULL,
 paystack_monthly_plan_code_ngn=NULL,paystack_annual_plan_code_ngn=NULL,
 updated_at=now()
FROM pilot v WHERE p.plan_key=v.plan_key;
-- Disable AI-required agents in the registry without deleting their configurations.
UPDATE public.ai_agent_registry SET active=false,updated_at=now() WHERE ai_dependency_mode='ai_required' AND active=true;
COMMIT;
