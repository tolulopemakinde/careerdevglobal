create schema if not exists careerdev_private;

create table public.saved_agent_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null,
  source text not null check (source in ('career-intelligence','career-coach','career-research','interview-coach','agent-worksheet')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(body) between 1 and 100000 and btrim(body) <> ''),
  fingerprint bytea not null,
  shared_coach_id uuid references public.coaches(id) on delete set null,
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, fingerprint)
);

create index saved_agent_reports_shared_coach_idx
  on public.saved_agent_reports (shared_coach_id, created_at desc) where shared_coach_id is not null;
create index saved_agent_reports_owner_created_idx on public.saved_agent_reports (owner_id, created_at desc);

alter table public.saved_agent_reports enable row level security;
revoke all on public.saved_agent_reports from public, anon, authenticated;
grant select (id,owner_id,owner_name,source,title,body,shared_coach_id,shared_at,created_at)
  on public.saved_agent_reports to authenticated;

create function careerdev_private.is_report_recipient(p_coach_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c join public.profiles p on p.id = c.profile_id
    where c.id = p_coach_id and p.id = (select auth.uid())
      and p.status = 'active' and p.role = 'coach'
      and c.application_status::text in ('approved', 'active')
  );
$$;
revoke all on function careerdev_private.is_report_recipient(uuid) from public, anon;
grant usage on schema careerdev_private to authenticated;
grant execute on function careerdev_private.is_report_recipient(uuid) to authenticated;

create policy saved_agent_reports_owner on public.saved_agent_reports for select to authenticated
  using (owner_id = (select auth.uid()));
create policy saved_agent_reports_recipient on public.saved_agent_reports for select to authenticated
  using (shared_coach_id is not null and careerdev_private.is_report_recipient(shared_coach_id));

create function public.save_my_agent_report(p_source text, p_title text, p_body text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  account_name text;
  report_id uuid;
  report_hash bytea;
begin
  select p.full_name into account_name from public.profiles p
    where p.id = caller and p.status = 'active' and p.role in ('client','coach','staff','admin');
  if not found then
    raise exception 'An active account is required to save a report' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('career-intelligence','career-coach','career-research','interview-coach','agent-worksheet')
    or p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_body is null or char_length(p_body) not between 1 and 100000 or btrim(p_body) = '' then
    raise exception 'Invalid report format' using errcode = '22023';
  end if;

  report_hash := sha256(convert_to(jsonb_build_array(p_source,btrim(p_title),p_body)::text,'UTF8'));
  insert into public.saved_agent_reports (owner_id,owner_name,source,title,body,fingerprint)
    values (caller,coalesce(nullif(btrim(account_name),''),'CareerDev user'),p_source,btrim(p_title),p_body,report_hash)
    on conflict (owner_id, fingerprint) do nothing
    returning id into report_id;
  if report_id is null then
    select r.id into report_id from public.saved_agent_reports r
      where r.owner_id = caller and r.fingerprint = report_hash;
  end if;
  return report_id;
end;
$$;

create function public.set_my_agent_report_coach(p_report_id uuid, p_coach_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in to manage report sharing' using errcode = '42501';
  end if;
  if p_coach_id is not null and (
    not exists (select 1 from public.profiles p where p.id = caller and p.status = 'active')
    or not exists (
      select 1 from public.get_public_coach_directory() d
      join public.coaches c on c.id = d.coach_id
      join public.profiles p on p.id = c.profile_id
      where d.coach_id = p_coach_id and p.status = 'active' and p.role = 'coach' and p.id <> caller
    )
  ) then
    raise exception 'Select an available CareerDev Coach' using errcode = '42501';
  end if;

  update public.saved_agent_reports r set
    shared_coach_id = p_coach_id,
    shared_at = case when p_coach_id is null then null
                     when r.shared_coach_id = p_coach_id then r.shared_at
                     else now() end
    where r.id = p_report_id and r.owner_id = caller;
  if not found then
    raise exception 'Report not available' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.save_my_agent_report(text,text,text) from public, anon, authenticated;
revoke all on function public.set_my_agent_report_coach(uuid,uuid) from public, anon, authenticated;
grant execute on function public.save_my_agent_report(text,text,text) to authenticated;
grant execute on function public.set_my_agent_report_coach(uuid,uuid) to authenticated;
