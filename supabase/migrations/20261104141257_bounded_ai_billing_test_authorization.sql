-- Empty by default. This does not enable the global billing release gate.
-- Only the named TEST project's server, using TEST provider credentials, may use
-- a separately owner-approved, expiring authorization for a new fixture account.
create table public.ai_billing_test_authorizations (
 user_id uuid primary key references auth.users(id) on delete restrict,
 approval_reference text not null check(approval_reference='owner-paid-fresher-20261104-a'),
 project_ref text not null check(project_ref='yyevuwvtrktrzwuzeddo'),
 enabled boolean not null default false,
 plan_key text not null default 'fresher' check(plan_key='fresher'),
 billing_interval text not null default 'monthly' check(billing_interval='monthly'),
 currency text not null default 'NGN' check(currency='NGN'),
 amount_minor integer not null default 750000 check(amount_minor=750000),
 monthly_credits integer not null default 25 check(monthly_credits=25),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 metadata jsonb not null default '{}'::jsonb,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours')
);
alter table public.ai_billing_test_authorizations enable row level security;
revoke all on public.ai_billing_test_authorizations from public,anon,authenticated;
grant all on public.ai_billing_test_authorizations to service_role;
comment on table public.ai_billing_test_authorizations is
 'Private, default-off, bounded TEST-only fixture authorization; never a production release approval.';
