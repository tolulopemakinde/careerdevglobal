create table public.profiles (
  id uuid primary key references auth.users(id), full_name text, email text,
  role text not null default 'client', status text not null default 'active', updated_at timestamptz default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(), profile_id uuid unique not null references public.profiles(id),
  status text not null default 'onboarding'
);
create table public.services (
  id uuid primary key default gen_random_uuid(), name text not null, active boolean not null default true
);
insert into public.services (name) values ('LinkedIn Profile Optimization');
create table public.service_requests (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
  service_id uuid references public.services(id), title text not null, original_request text,
  objective text, priority text, status text not null default 'new', created_at timestamptz not null default now()
);
create table public.documents (
  id uuid primary key default gen_random_uuid(), request_id uuid references public.service_requests(id),
  original_filename text, file_size bigint, status text, uploaded_at timestamptz
);
create table public.career_intelligence_reports (request_id uuid, report jsonb, recommendations jsonb);
create table public.intake_responses (request_id uuid, question_id uuid, response_text text, answered_at timestamptz);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.service_requests enable row level security;
alter table public.documents enable row level security;
alter table public.career_intelligence_reports enable row level security;
alter table public.intake_responses enable row level security;

grant select on public.clients, public.service_requests, public.documents, public.career_intelligence_reports, public.intake_responses to authenticated;
grant update (original_request, objective) on public.service_requests to authenticated;
create policy client_read on public.clients for select to authenticated using (profile_id = (select auth.uid()));
create policy request_read on public.service_requests for select to authenticated
  using (exists (select 1 from public.clients c where c.id=client_id and c.profile_id=(select auth.uid())));
create policy request_edit on public.service_requests for update to authenticated
  using (exists (select 1 from public.clients c where c.id=client_id and c.profile_id=(select auth.uid())))
  with check (exists (select 1 from public.clients c where c.id=client_id and c.profile_id=(select auth.uid())));

create function public.get_my_ai_credit_status()
returns jsonb language sql stable as $$select '{"credits_remaining":0,"monthly_allowance":0,"credits_consumed":0,"credits_reserved":0}'::jsonb$$;
grant execute on function public.get_my_ai_credit_status() to authenticated;

-- Mirrors the relevant request-creation behavior, with only the relations needed on this disposable instance.
create function public.create_client_service_request(p_full_name text,p_service_name text,p_original_request text,p_objective text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  client_id uuid;
  service_id uuid;
  request_id uuid;
begin
  select email into strict caller_email from auth.users where id=caller;
  select id into strict service_id from public.services where name=p_service_name and active;
  insert into public.profiles(id,full_name,email) values(caller,p_full_name,caller_email)
    on conflict(id) do update set full_name=excluded.full_name;
  insert into public.clients(profile_id) values(caller)
    on conflict(profile_id) do update set profile_id=excluded.profile_id returning id into client_id;
  insert into public.service_requests(client_id,service_id,title,original_request,objective,priority)
    values(client_id,service_id,p_service_name,p_original_request,p_objective,'normal') returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.create_client_service_request(text,text,text,text) from public, anon;
grant execute on function public.create_client_service_request(text,text,text,text) to authenticated;
