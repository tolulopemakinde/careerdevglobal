-- PHASE 3 PREVIEW ARTIFACT — NOT APPLIED TO ANY SUPABASE PROJECT.
-- Apply only after owner review, an isolated preview project, synthetic data,
-- and a reviewed service-role deployment plan.
-- This migration deliberately does not alter existing RLS policies or grants.

create table if not exists public.ai_distributed_rate_limits (
  bucket_key text primary key check (length(bucket_key) between 1 and 256),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_shared_quota_policies (
  quota_key text primary key check (length(quota_key) between 1 and 128),
  name text not null,
  period_type text not null check (period_type in ('minute', 'hour', 'day', 'month')),
  request_limit integer not null check (request_limit >= 0),
  credit_limit integer not null default 0 check (credit_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_shared_quota_usage (
  quota_key text not null references public.ai_shared_quota_policies(quota_key),
  period_start timestamptz not null,
  period_end timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  credit_units integer not null default 0 check (credit_units >= 0),
  updated_at timestamptz not null default now(),
  primary key (quota_key, period_start, period_end)
);

create index if not exists ai_distributed_rate_limits_updated_idx
  on public.ai_distributed_rate_limits (updated_at);
create index if not exists ai_shared_quota_usage_period_idx
  on public.ai_shared_quota_usage (period_end, quota_key);

alter table public.ai_distributed_rate_limits enable row level security;
alter table public.ai_shared_quota_policies enable row level security;
alter table public.ai_shared_quota_usage enable row level security;

revoke all on table public.ai_distributed_rate_limits, public.ai_shared_quota_policies, public.ai_shared_quota_usage
  from public, anon, authenticated;
grant all on table public.ai_distributed_rate_limits, public.ai_shared_quota_policies, public.ai_shared_quota_usage
  to service_role;

comment on table public.ai_distributed_rate_limits is
  'Server-only atomic request windows for distributed Edge Function abuse control.';
comment on table public.ai_shared_quota_policies is
  'Server-only governed shared caps; does not replace per-user AI credit ledger enforcement.';
comment on table public.ai_shared_quota_usage is
  'Atomic shared-cap counters for service-wide or endpoint-wide request and credit budgets.';

create or replace function public.consume_distributed_rate_limit(
  p_bucket_key text,
  p_window_seconds integer default 60,
  p_max_requests integer default 12
)
returns table(allowed boolean, retry_after_seconds integer, request_count integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.ai_distributed_rate_limits%rowtype;
  v_window interval;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 or length(p_bucket_key) > 256
     or p_window_seconds not between 1 and 86400
     or p_max_requests not between 1 and 100000 then
    raise exception 'Invalid rate-limit parameters';
  end if;
  v_window := make_interval(secs => p_window_seconds);
  insert into public.ai_distributed_rate_limits(bucket_key, window_started_at, request_count, updated_at)
  values (trim(p_bucket_key), v_now, 1, v_now)
  on conflict (bucket_key) do nothing;
  select * into v_row from public.ai_distributed_rate_limits
  where bucket_key = trim(p_bucket_key) for update;
  if v_now >= v_row.window_started_at + v_window then
    update public.ai_distributed_rate_limits
       set window_started_at = v_now, request_count = 1, updated_at = v_now
     where bucket_key = trim(p_bucket_key);
    return query select true, 0, 1;
    return;
  end if;
  if v_row.request_count >= p_max_requests then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer),
      v_row.request_count;
    return;
  end if;
  update public.ai_distributed_rate_limits
     set request_count = request_count + 1, updated_at = v_now
   where bucket_key = trim(p_bucket_key);
  return query select true, 0, v_row.request_count + 1;
end;
$function$;

create or replace function public.consume_shared_ai_quota(
  p_quota_key text,
  p_request_units integer default 1,
  p_credit_units integer default 0
)
returns table(allowed boolean, reason text, retry_after_seconds integer, request_count integer, request_limit integer, credit_units integer, credit_limit integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_policy public.ai_shared_quota_policies%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := clock_timestamp();
  v_usage public.ai_shared_quota_usage%rowtype;
  v_next_requests integer;
  v_next_credits integer;
begin
  if p_quota_key is null or length(trim(p_quota_key)) = 0
     or p_request_units not between 0 and 1000
     or p_credit_units not between 0 and 100000 then
    raise exception 'Invalid shared-quota parameters';
  end if;
  select * into v_policy from public.ai_shared_quota_policies
  where quota_key = trim(p_quota_key) and active = true;
  if not found then
    return query select false, 'quota_policy_unavailable', 60, 0, 0, 0, 0;
    return;
  end if;
  v_start := case v_policy.period_type
    when 'minute' then date_trunc('minute', v_now)
    when 'hour' then date_trunc('hour', v_now)
    when 'day' then date_trunc('day', v_now)
    else date_trunc('month', v_now)
  end;
  v_end := case v_policy.period_type
    when 'minute' then v_start + interval '1 minute'
    when 'hour' then v_start + interval '1 hour'
    when 'day' then v_start + interval '1 day'
    else v_start + interval '1 month'
  end;
  insert into public.ai_shared_quota_usage(quota_key, period_start, period_end)
  values (v_policy.quota_key, v_start, v_end)
  on conflict (quota_key, period_start, period_end) do nothing;
  select * into v_usage from public.ai_shared_quota_usage
  where quota_key = v_policy.quota_key and period_start = v_start and period_end = v_end
  for update;
  v_next_requests := v_usage.request_count + p_request_units;
  v_next_credits := v_usage.credit_units + p_credit_units;
  if v_next_requests > v_policy.request_limit then
    return query select false, 'shared_request_quota_exhausted',
      greatest(1, ceil(extract(epoch from (v_end - v_now)))::integer),
      v_usage.request_count, v_policy.request_limit, v_usage.credit_units, v_policy.credit_limit;
    return;
  end if;
  if v_next_credits > v_policy.credit_limit then
    return query select false, 'shared_credit_quota_exhausted',
      greatest(1, ceil(extract(epoch from (v_end - v_now)))::integer),
      v_usage.request_count, v_policy.request_limit, v_usage.credit_units, v_policy.credit_limit;
    return;
  end if;
  update public.ai_shared_quota_usage
     set request_count = v_next_requests, credit_units = v_next_credits, updated_at = v_now
   where quota_key = v_policy.quota_key and period_start = v_start and period_end = v_end;
  return query select true, 'shared_quota_consumed', 0,
    v_next_requests, v_policy.request_limit, v_next_credits, v_policy.credit_limit;
end;
$function$;

-- Do not grant these functions to anon/authenticated. The Edge Function must
-- call them with a server-only service-role client after preview verification.
revoke all on function public.consume_distributed_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.consume_shared_ai_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_distributed_rate_limit(text, integer, integer) to service_role;
grant execute on function public.consume_shared_ai_quota(text, integer, integer) to service_role;

insert into public.ai_shared_quota_policies(quota_key, name, period_type, request_limit, credit_limit)
values ('coach_matching_public', 'Public coach matching shared protection', 'minute', 600, 0)
on conflict (quota_key) do nothing;
