-- REVIEW DRAFT ONLY — NOT A SUPABASE MIGRATION.
-- Do not execute against Production or add this file to supabase/migrations.
-- Prerequisites: restore and review the authoritative migration baseline; rehearse
-- against an isolated, Production-aligned project with synthetic booking records.
-- This ledger is a building block only. It does not implement RPC state transitions,
-- provider idempotency, cancellation, or reconciliation by itself.

create table public.marketplace_booking_provider_operations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null
    references public.marketplace_booking_requests(id) on delete restrict,
  operation_type text not null
    check (operation_type in ('schedule', 'cancel', 'reschedule_sync')),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  state text not null default 'claimed'
    check (state in (
      'claimed',
      'provider_succeeded',
      'committed',
      'failed',
      'reconciliation_required'
    )),
  provider_event_uri text,
  provider_invitee_uri text,
  last_error_code text,
  attempt_count integer not null default 1 check (attempt_count > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index marketplace_booking_provider_one_open_operation
  on public.marketplace_booking_provider_operations (booking_id)
  where state in ('claimed', 'provider_succeeded', 'reconciliation_required');

create index marketplace_booking_provider_operations_booking_history
  on public.marketplace_booking_provider_operations (booking_id, created_at desc);

alter table public.marketplace_booking_provider_operations enable row level security;

revoke all on table public.marketplace_booking_provider_operations
  from public, anon, authenticated;
grant select, insert, update on table public.marketplace_booking_provider_operations
  to service_role;

comment on table public.marketplace_booking_provider_operations is
  'Proposed internal idempotency and reconciliation ledger for external booking operations; review draft only.';
