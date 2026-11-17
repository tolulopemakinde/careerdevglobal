-- Acceptance-only candidate; never apply to either protected hosted project.
begin;
create table public.calendly_acceptance_locks (
 coach_id uuid primary key references public.coaches(id), id uuid not null unique,
 kind text not null check(kind in ('refresh','subscription','revoke')),
 created_at timestamptz not null default now()
);
create table public.calendly_acceptance_subscriptions (
 coach_id uuid primary key references public.coaches(id), uri text,
 state text not null check(state in ('creating','uncertain','active','deleted')),
 check(uri is null or uri ~ '^https://api[.]calendly[.]com/webhook_subscriptions/[A-Za-z0-9-]+$')
);
create table public.calendly_acceptance_webhooks (
 digest text primary key, event text not null check(event in ('invitee.created','invitee.canceled')),
 event_uri text not null, invitee_uri text not null, operation_id uuid,
 state text not null default 'pending' check(state in ('pending','processing','done','ignored')),
 attempts integer not null default 0, lease_until timestamptz,
 received_at timestamptz not null default now(), processed_at timestamptz,
 check(event_uri ~ '^https://api[.]calendly[.]com/scheduled_events/[A-Za-z0-9-]+$'),
 check(invitee_uri ~ '^https://api[.]calendly[.]com/scheduled_events/[A-Za-z0-9-]+/invitees/[A-Za-z0-9-]+$')
);
alter table public.calendly_acceptance_locks enable row level security;
alter table public.calendly_acceptance_subscriptions enable row level security;
alter table public.calendly_acceptance_webhooks enable row level security;
revoke all on public.calendly_acceptance_locks,public.calendly_acceptance_subscriptions,public.calendly_acceptance_webhooks from public,anon,authenticated;
grant select,insert,update,delete on public.calendly_acceptance_locks,public.calendly_acceptance_subscriptions,public.calendly_acceptance_webhooks to service_role;
create function public.claim_calendly_webhook(p_digest text) returns jsonb
language sql security invoker set search_path='' as $$
 update public.calendly_acceptance_webhooks set state='processing',attempts=attempts+1,lease_until=now()+interval '60 seconds'
 where digest=p_digest and (state='pending' or (state='processing' and lease_until<now())) returning to_jsonb(calendly_acceptance_webhooks.*);
$$;
create function public.lookup_calendly_webhook_operation(p_operation_id uuid,p_event_uri text,p_invitee_uri text) returns jsonb
language sql security invoker set search_path='' as $$
 select to_jsonb(o.*) from careerdev_scheduling_private.calendly_operations o
 where (o.id=p_operation_id and o.kind='confirm') or (o.kind='cancel' and o.provider_event_uri=p_event_uri and o.provider_invitee_uri=p_invitee_uri)
 order by case when o.kind='cancel' then 0 else 1 end limit 1;
$$;
revoke all on function public.claim_calendly_webhook(text), public.lookup_calendly_webhook_operation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_calendly_webhook(text), public.lookup_calendly_webhook_operation(uuid,text,text) to service_role;
commit;
