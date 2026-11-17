-- Recovered application schema + real triggers; synthetic identities only.
\set ON_ERROR_STOP on
begin;
update public.coach_service_offerings set calendly_event_type_uri='https://api.calendly.com/event_types/full-schema' where id='55555555-5555-4555-8555-000000000003';
insert into public.calendly_connections(coach_id,calendly_user_uri,access_token_ciphertext,refresh_token_ciphertext,scopes,token_expires_at)
values('22222222-2222-4222-8222-000000000003','https://api.calendly.com/users/full-schema','synthetic-encrypted-fixture','synthetic-refresh-fixture',array['users:read','event_types:read','scheduled_events:write','webhooks:write'],now()+interval '1 hour');
insert into public.marketplace_booking_requests(id,client_id,coach_id,service_id,coach_service_offering_id,requested_start,requested_end,timezone,booking_status)
values('77777777-7777-4777-8777-000000000001','33333333-3333-4333-8333-000000000001','22222222-2222-4222-8222-000000000003','44444444-4444-4444-8444-000000000001','55555555-5555-4555-8555-000000000003','2090-01-01T10:00Z','2090-01-01T10:30Z','UTC','requested');
set local role service_role;
do $$
declare b uuid='77777777-7777-4777-8777-000000000001'; actor uuid='11111111-1111-4111-8111-000000000003'; op jsonb; tx uuid; saved uuid;
 snap jsonb='{"provider_user_uri":"https://api.calendly.com/users/full-schema","provider_type_uri":"https://api.calendly.com/event_types/full-schema","starts_at":"2090-01-01T10:00:00Z","ends_at":"2090-01-01T10:30:00Z"}';
 event text='https://api.calendly.com/scheduled_events/full-schema'; invitee text='https://api.calendly.com/scheduled_events/full-schema/invitees/synthetic'; ctx jsonb;
begin
 op=public.begin_calendly_operation(b,actor,'confirm',snap);
 if not (op->>'dispatch')::boolean then raise exception 'claim missing'; end if;
 perform public.flag_calendly_operation((op->>'id')::uuid);
 if (public.begin_calendly_operation(b,actor,'confirm',snap)->>'dispatch')::boolean then raise exception 'uncertain redispatched'; end if;
 perform public.record_calendly_receipt((op->>'id')::uuid,event,invitee);
 perform public.finish_calendly_operation(b,(op->>'id')::uuid,event,invitee);
 perform public.finish_calendly_operation(b,(op->>'id')::uuid,event,invitee);
 if (select count(*) from public.marketplace_notifications where booking_id=b and notification_type='booking_confirmed')<>1 then raise exception 'confirmation trigger duplicate/missing'; end if;
 -- Initialize synthetic financial metadata without calling a payment provider.
 insert into public.marketplace_transactions(booking_id,client_id,coach_id,service_id,currency,gross_amount,platform_share_pct,coach_share_pct,platform_fee,coach_earnings,provider_transaction_reference)
 values(b,'33333333-3333-4333-8333-000000000001','22222222-2222-4222-8222-000000000003','44444444-4444-4444-8444-000000000001','NGN',0,20,80,0,0,'synthetic-not-a-payment') returning id into tx;
 ctx=public.get_calendly_reschedule_context(b,'11111111-1111-4111-8111-000000000001');
 ctx=ctx||jsonb_build_object('replacement_event_uri',event||'-moved','replacement_invitee_uri',event||'-moved/invitees/moved','replacement_start','2090-01-02T10:00:00Z','replacement_end','2090-01-02T10:30:00Z');
 perform public.apply_calendly_reschedule(b,'11111111-1111-4111-8111-000000000001',ctx);
 perform public.apply_calendly_reschedule(b,'11111111-1111-4111-8111-000000000001',ctx);
 select id into saved from public.marketplace_transactions where booking_id=b;
 if saved is distinct from tx then raise exception 'transaction identity changed'; end if;
 event=event||'-moved'; invitee=event||'/invitees/moved';
 snap=jsonb_build_object('provider_user_uri','https://api.calendly.com/users/full-schema','provider_event_uri',event,'provider_invitee_uri',invitee,'starts_at','2090-01-02T10:00:00Z','ends_at','2090-01-02T10:30:00Z');
 op=public.begin_calendly_operation(b,actor,'cancel',snap);
 perform public.finish_calendly_operation(b,(op->>'id')::uuid,event,invitee);
 perform public.finish_calendly_operation(b,(op->>'id')::uuid,event,invitee);
 if (select count(*) from public.marketplace_notifications where booking_id=b and notification_type='booking_cancelled')<>1 then raise exception 'cancellation trigger duplicate/missing'; end if;
 if not exists(select 1 from public.marketplace_transactions where id=tx and booking_id=b and provider_transaction_reference='synthetic-not-a-payment' and payment_status='pending') then raise exception 'financial metadata changed'; end if;
 insert into public.calendly_acceptance_webhooks(digest,event,event_uri,invitee_uri) values('synthetic-digest','invitee.created',event,invitee) on conflict do nothing;
 insert into public.calendly_acceptance_webhooks(digest,event,event_uri,invitee_uri) values('synthetic-digest','invitee.created',event,invitee) on conflict do nothing;
 if public.claim_calendly_webhook('synthetic-digest') is null then raise exception 'receipt not claimable'; end if;
 if public.claim_calendly_webhook('synthetic-digest') is not null then raise exception 'receipt double claimed'; end if;
 update public.calendly_acceptance_webhooks set lease_until=now()-interval '1 second' where digest='synthetic-digest';
 if public.claim_calendly_webhook('synthetic-digest') is null then raise exception 'receipt crash recovery failed'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.calendly_acceptance_webhooks','select') or has_table_privilege('authenticated','public.calendly_acceptance_locks','select') or has_function_privilege('authenticated','public.claim_calendly_webhook(text)','execute') then raise exception 'lifecycle privilege exposure'; end if;
end $$;
commit;
select 'FULL_SCHEMA_PASS: durable uncertain recovery, idempotent completion, notification triggers, reschedule, cancellation, financial reference, inbox replay/lease and grants';
