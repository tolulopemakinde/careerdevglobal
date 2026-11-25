-- USD AI subscriptions stay off until Paystack completes merchant currency enablement.
create table if not exists public.ai_subscription_currency_settings (
  currency text primary key check (currency = 'USD'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.ai_subscription_currency_settings (currency, enabled)
values ('USD', false)
on conflict (currency) do nothing;

alter table public.ai_subscription_currency_settings enable row level security;

revoke all on public.ai_subscription_currency_settings from public, anon, authenticated;
grant select (currency, enabled) on public.ai_subscription_currency_settings to anon, authenticated;
grant select (currency, enabled) on public.ai_subscription_currency_settings to service_role;
grant update (enabled) on public.ai_subscription_currency_settings to authenticated;

drop policy if exists ai_subscription_currency_settings_public_read on public.ai_subscription_currency_settings;
create policy ai_subscription_currency_settings_public_read
  on public.ai_subscription_currency_settings
  for select
  to anon, authenticated
  using (currency = 'USD');

drop policy if exists ai_subscription_currency_settings_admin_update on public.ai_subscription_currency_settings;
create policy ai_subscription_currency_settings_admin_update
  on public.ai_subscription_currency_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.status = 'active'
    )
  );

create or replace function public.set_ai_subscription_currency_settings_audit_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.set_ai_subscription_currency_settings_audit_fields() from public, anon, authenticated;

drop trigger if exists ai_subscription_currency_settings_audit_fields on public.ai_subscription_currency_settings;
create trigger ai_subscription_currency_settings_audit_fields
  before update on public.ai_subscription_currency_settings
  for each row execute function public.set_ai_subscription_currency_settings_audit_fields();
