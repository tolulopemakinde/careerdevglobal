-- Synthetic contract fixture. Run only in an empty, disposable Postgres database.
create extension btree_gist;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table profiles (id uuid primary key);
create table coaches (id uuid primary key, profile_id uuid references profiles, application_status text);
create table clients (id uuid primary key, profile_id uuid references profiles);
create function ensure_my_client_account() returns setof clients
  language sql as $$ select * from public.clients where profile_id = auth.uid() $$;
create table services (id uuid primary key, active boolean not null);
create table coach_service_offerings (
  id uuid primary key, coach_id uuid references coaches, service_id uuid references services,
  active boolean, duration_minutes integer, calendly_event_type_uri text, price numeric, currency text
);
create table calendly_connections (coach_id uuid primary key, calendly_user_uri text, active boolean);
create table calendly_oauth_states (id uuid);
create table marketplace_booking_requests (
  id uuid primary key default gen_random_uuid(), client_id uuid references clients, coach_id uuid references coaches,
  service_id uuid references services, coach_service_offering_id uuid references coach_service_offerings,
  booking_status text, requested_start timestamptz, requested_end timestamptz, timezone text,
  calendly_event_uri text, calendly_invitee_uri text, calendly_booking_status text,
  calendly_last_error text, updated_at timestamptz, service_request_id uuid, client_notes text
);
create table marketplace_booking_slots (
  id uuid primary key default gen_random_uuid(), booking_id uuid references marketplace_booking_requests,
  coach_id uuid references coaches, start_at timestamptz not null, end_at timestamptz not null,
  timezone text not null, status text, updated_at timestamptz,
  exclude using gist (coach_id with =, tstzrange(start_at, end_at, '[)') with &&)
    where (status in ('held', 'booked'))
);
create table marketplace_booking_events (
  booking_id uuid references marketplace_booking_requests, event_type text,
  actor_type text, actor_id uuid references profiles, event_data jsonb
);
create table platform_revenue_split_config (
  active boolean, effective_from timestamptz, effective_to timestamptz,
  platform_share_pct numeric, coach_share_pct numeric
);
create table marketplace_transactions (
  id uuid primary key default gen_random_uuid(), booking_id uuid unique,
  client_id uuid, coach_id uuid, service_id uuid, currency text, gross_amount numeric,
  platform_share_pct numeric, coach_share_pct numeric, platform_fee numeric, coach_earnings numeric
);
create table marketplace_transaction_events (
  transaction_id uuid references marketplace_transactions, event_type text,
  actor_type text, actor_id uuid references profiles, event_data jsonb
);
alter table marketplace_transactions enable row level security;
alter table calendly_connections enable row level security;

create view marketplace_coach_directory as select id from coaches;
create view marketplace_coach_discovery as select id from coaches;
create function get_public_coach_directory() returns int language sql security definer as $$ select 1 $$;
create function get_public_service_directory() returns int language sql security definer as $$ select 1 $$;
revoke all on function get_public_coach_directory(), get_public_service_directory() from public;
grant select on all tables in schema public to anon;
grant select, insert, update on all tables in schema public to service_role;

insert into profiles values
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');
insert into coaches values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'approved');
insert into clients values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000002');
insert into services values ('00000000-0000-0000-0000-000000000031', true);
insert into coach_service_offerings values ('00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000031',
  true, 30, 'https://api.calendly.com/event_types/type-1', 101.55, 'NGN');
insert into calendly_connections values ('00000000-0000-0000-0000-000000000011', 'https://api.calendly.com/users/coach', true);
insert into marketplace_booking_requests (id, client_id, coach_id, service_id, coach_service_offering_id,
  booking_status, requested_start, requested_end, timezone)
select id::uuid, '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000041',
  'requested', '2090-01-01T10:00:00Z', '2090-01-01T10:30:00Z', 'UTC'
from (values ('00000000-0000-0000-0000-000000000051'), ('00000000-0000-0000-0000-000000000052')) v(id);
insert into platform_revenue_split_config values (true, '2020-01-01', null, 20, 80);
