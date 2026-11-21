-- Track the Admin AI release dashboard objects found in the live schema and
-- harden their access checks. The production objects already exist; these
-- statements are idempotent and bring rebuilt/test databases into parity.

create table if not exists public.ai_release_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prompt_version_id uuid not null references public.ai_prompt_versions(id) on delete restrict,
  model_version_id uuid not null references public.ai_model_versions(id) on delete restrict,
  test_case_ids jsonb not null default '[]'::jsonb,
  evaluation_summary jsonb not null default '{}'::jsonb,
  regression_summary jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status = any (array['draft','testing','approved','released','rejected','rolled_back']::text[])),
  release_notes text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_release_candidates_approved_by
  on public.ai_release_candidates(approved_by);
create index if not exists idx_ai_release_candidates_created_by
  on public.ai_release_candidates(created_by);
create index if not exists idx_ai_release_candidates_model
  on public.ai_release_candidates(model_version_id);
create index if not exists idx_ai_release_candidates_prompt
  on public.ai_release_candidates(prompt_version_id);
create index if not exists idx_ai_release_candidates_status
  on public.ai_release_candidates(status);

alter table public.ai_release_candidates enable row level security;
drop policy if exists ai_release_candidates_staff_admin on public.ai_release_candidates;
create policy ai_release_candidates_staff_admin
  on public.ai_release_candidates
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('staff','admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('staff','admin')
    )
  );
revoke all on public.ai_release_candidates from public, anon, authenticated;
grant select on public.ai_release_candidates to authenticated;
grant all on public.ai_release_candidates to service_role;

create or replace function public.get_ai_release_candidates()
returns setof public.ai_release_candidates
language plpgsql
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role in ('admin','staff')
  ) then
    raise exception 'Active Admin or Staff access required';
  end if;
  return query
  select * from public.ai_release_candidates
  order by created_at desc;
end;
$function$;
revoke all on function public.get_ai_release_candidates() from public, anon;
grant execute on function public.get_ai_release_candidates() to authenticated, service_role;

-- This SECURITY DEFINER function must explicitly require an active Admin.
-- IS DISTINCT FROM semantics avoid NULL-profile callers passing a <> check.
create or replace function public.admin_get_platform_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role = 'admin'
  ) then
    raise exception 'Active administrator access required';
  end if;

  select jsonb_build_object(
    'period_days', 30,
    'revenue_by_currency', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', currency,
        'gross', round(gross::numeric,2),
        'platform_fee', round(platform_fee::numeric,2),
        'coach_earnings', round(coach_earnings::numeric,2),
        'transactions', transactions
      ) order by currency)
      from (
        select currency, sum(gross_amount) gross, sum(platform_fee) platform_fee,
               sum(coach_earnings) coach_earnings, count(*) transactions
        from public.marketplace_transactions
        where created_at >= now() - interval '30 days'
          and lower(coalesce(payment_status,'')) in ('paid','succeeded','success','completed','settled')
        group by currency
      ) r
    ), '[]'::jsonb),
    'revenue_12m_by_currency', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(month_start,'YYYY-MM'),
        'currency', currency,
        'gross', round(gross::numeric,2),
        'platform_fee', round(platform_fee::numeric,2)
      ) order by month_start, currency)
      from (
        select date_trunc('month',created_at) month_start, currency,
               sum(gross_amount) gross, sum(platform_fee) platform_fee
        from public.marketplace_transactions
        where created_at >= date_trunc('month',now()) - interval '11 months'
          and lower(coalesce(payment_status,'')) in ('paid','succeeded','success','completed','settled')
        group by 1,2
      ) m
    ), '[]'::jsonb),
    'users_30d', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'users_by_role', coalesce((
      select jsonb_object_agg(role, total) from (
        select role::text role, count(*) total from public.profiles group by role order by role::text
      ) x
    ), '{}'::jsonb),
    'bookings_30d', (select count(*) from public.marketplace_booking_requests where created_at >= now() - interval '30 days'),
    'sales_30d', (select count(*) from public.marketplace_transactions where created_at >= now() - interval '30 days'
      and lower(coalesce(payment_status,'')) in ('paid','succeeded','success','completed','settled')),
    'views_30d', (select count(*) from public.blog_views where viewed_at >= now() - interval '30 days'),
    'top_blog_posts', coalesce((
      select jsonb_agg(jsonb_build_object('post_id',post_id,'title',title,'views',views) order by views desc)
      from (
        select v.post_id, p.title, count(*) views
        from public.blog_views v join public.blog_posts p on p.id=v.post_id
        where v.viewed_at >= now() - interval '30 days'
        group by v.post_id,p.title
        order by views desc limit 5
      ) b
    ), '[]'::jsonb),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open','in_progress','waiting_on_customer')),
    'open_disputes', (select count(*) from public.marketplace_disputes where status not in ('resolved','closed')),
    'pending_refunds', (select count(*) from public.marketplace_refund_requests where status not in ('approved','rejected','completed','cancelled')),
    'unread_admin_notifications', (select count(*) from public.marketplace_notifications
      where profile_id = auth.uid() and read_at is null and status not in ('read','dismissed')),
    'recent_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'title',title,'body',body,'priority',priority,'category',category,
        'status',status,'read_at',read_at,'created_at',created_at,'action_url',action_url
      ) order by created_at desc)
      from (
        select id,title,body,priority,category,status,read_at,created_at,action_url
        from public.marketplace_notifications
        where profile_id = auth.uid()
        order by created_at desc limit 8
      ) n
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;
revoke all on function public.admin_get_platform_analytics() from public, anon;
grant execute on function public.admin_get_platform_analytics() to authenticated, service_role;
