-- Synthetic columns for the local Supabase adapter rehearsal only.
-- Derived from the recovered catalog; this is not a production migration.
alter table public.profiles add column role text default 'client', add column status text default 'active',
  add column email text, add column full_name text, add column timezone text default 'UTC';
alter table public.calendly_oauth_states alter column id set default gen_random_uuid();
alter table public.calendly_oauth_states add primary key (id), add column state_hash text unique,
  add column coach_id uuid references public.coaches(id), add column code_verifier text,
  add column expires_at timestamptz, add column created_at timestamptz default now();
alter table public.calendly_oauth_states enable row level security;
revoke all on public.calendly_oauth_states from public, anon, authenticated;
grant select, insert, delete on public.calendly_oauth_states to service_role;
alter table public.calendly_connections add column calendly_user_email text, add column calendly_user_name text,
  add column calendly_scheduling_url text, add column refresh_token_ciphertext text,
  add column scopes text[], add column connected_at timestamptz default now(), add column updated_at timestamptz;
grant delete on public.calendly_connections to service_role;
notify pgrst, 'reload schema';
