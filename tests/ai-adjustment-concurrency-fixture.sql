-- Extend the existing fictional schema in the dedicated CI database.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() <> 'synthetic_ai_adjustment_fixture' THEN
    RAISE EXCEPTION 'Requires the disposable adjustment fixture';
  END IF;
END $$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

-- Install the actual access function and ledger triggers from the policy migration.
DROP FUNCTION public.ai_payment_access_allowed(uuid);
CREATE TABLE public.ai_subscription_payments (
  reference text PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.ai_agent_subscriptions(id),
  provider_transaction_id text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL
);

INSERT INTO public.profiles VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'client', 'active'),
  ('10000000-0000-0000-0000-000000000003', 'client', 'active');
INSERT INTO public.ai_agent_subscription_plans VALUES ('fresher', true, 25, '{}');
INSERT INTO public.ai_agent_subscriptions
  (id, user_id, plan_key, status, current_period_start, current_period_end)
VALUES
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   'fresher', 'active', now() - interval '1 minute', now() + interval '1 month'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003',
   'fresher', 'active', now() - interval '1 minute', now() + interval '1 month');
