-- Synthetic-only PostgreSQL schema for PR #42. CI disposable database ONLY.
-- No connection to Supabase, real user accounts, payment keys or live data.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.ai_agent_registry (
  id uuid PRIMARY KEY,
  agent_key text NOT NULL
);
CREATE TABLE public.ai_credit_operations (
  operation_key text PRIMARY KEY,
  active boolean NOT NULL,
  agent_key text,
  credit_cost integer NOT NULL
);
CREATE TABLE public.ai_agent_execution_requests (
  id uuid PRIMARY KEY,
  execution_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  agent_id uuid NOT NULL
);
CREATE TABLE public.ai_agent_subscription_plans (
  plan_key text PRIMARY KEY,
  active boolean NOT NULL,
  monthly_credits integer NOT NULL,
  included_agents text[] NOT NULL
);
CREATE TABLE public.ai_agent_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_key text NOT NULL,
  status text NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  plan_key text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  operation_key text NOT NULL,
  agent_key text,
  execution_id uuid,
  request_id uuid,
  credits integer NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id,idempotency_key)
);

-- Simulate positive payment access by default; individual cases can opt out.
CREATE FUNCTION public.ai_payment_access_allowed(uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('fixture.payment_allowed',true),'true')='true';
$$;
