-- Captured from test project yyevuwvtrktrzwuzeddo on 2026-11-04.
-- Recovery reference only. NOT a production migration.
-- ORIGINAL (rollback reference):
CREATE OR REPLACE FUNCTION public.create_marketplace_booking_request(p_client_id uuid, p_coach_id uuid, p_coach_service_offering_id uuid, p_service_request_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_timezone text, p_client_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_client public.clients%rowtype; v_offering public.coach_service_offerings%rowtype; v_coach public.coaches%rowtype; v_booking public.marketplace_booking_requests%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v_client from public.ensure_my_client_account();
 if v_client.id<>p_client_id then raise exception 'Client account does not match the signed-in user'; end if;
 select * into v_offering from public.coach_service_offerings where id=p_coach_service_offering_id and active=true;
 if not found then raise exception 'Selected coaching service is unavailable'; end if;
 select * into v_coach from public.coaches where id=p_coach_id and application_status in ('approved','active');
 if not found then raise exception 'Coach is not currently available for booking'; end if;
 if v_offering.coach_id<>p_coach_id then raise exception 'Selected service does not belong to this coach'; end if;
 if p_end_at<=p_start_at then raise exception 'Invalid booking time'; end if;
 if extract(epoch from (p_end_at-p_start_at))/60<>v_offering.duration_minutes then raise exception 'Booking duration does not match the selected service'; end if;
 if exists(select 1 from public.marketplace_booking_slots s where s.coach_id=p_coach_id and s.status in ('held','booked') and p_start_at<s.end_at and p_end_at>s.start_at) then raise exception 'That time is no longer available. Please choose another slot.'; end if;
 insert into public.marketplace_booking_requests(client_id,coach_id,service_id,coach_service_offering_id,service_request_id,requested_start,requested_end,timezone,booking_status,client_notes)
 values(v_client.id,p_coach_id,v_offering.service_id,p_coach_service_offering_id,p_service_request_id,p_start_at,p_end_at,p_timezone,'requested',p_client_notes) returning * into v_booking;
 insert into public.marketplace_booking_events(booking_id,event_type,actor_profile_id,metadata) values(v_booking.id,'booking_requested',auth.uid(),jsonb_build_object('source','coach_profile'));
 return jsonb_build_object('id',v_booking.id,'booking_status',v_booking.booking_status);
end; $function$

-- CORRECTED CANDIDATE (applied only to test project after backup):
CREATE OR REPLACE FUNCTION public.create_marketplace_booking_request(p_client_id uuid, p_coach_id uuid, p_coach_service_offering_id uuid, p_service_request_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_timezone text, p_client_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_client public.clients%rowtype; v_offering public.coach_service_offerings%rowtype; v_coach public.coaches%rowtype; v_booking public.marketplace_booking_requests%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v_client from public.ensure_my_client_account();
 if v_client.id<>p_client_id then raise exception 'Client account does not match the signed-in user'; end if;
 select * into v_offering from public.coach_service_offerings where id=p_coach_service_offering_id and active=true;
 if not found then raise exception 'Selected coaching service is unavailable'; end if;
 select * into v_coach from public.coaches where id=p_coach_id and application_status in ('approved','active');
 if not found then raise exception 'Coach is not currently available for booking'; end if;
 if v_offering.coach_id<>p_coach_id then raise exception 'Selected service does not belong to this coach'; end if;
 if p_end_at<=p_start_at then raise exception 'Invalid booking time'; end if;
 if extract(epoch from (p_end_at-p_start_at))/60<>v_offering.duration_minutes then raise exception 'Booking duration does not match the selected service'; end if;
 if exists(select 1 from public.marketplace_booking_slots s where s.coach_id=p_coach_id and s.status in ('held','booked') and p_start_at<s.end_at and p_end_at>s.start_at) then raise exception 'That time is no longer available. Please choose another slot.'; end if;
 insert into public.marketplace_booking_requests(client_id,coach_id,service_id,coach_service_offering_id,service_request_id,requested_start,requested_end,timezone,booking_status,client_notes)
 values(v_client.id,p_coach_id,v_offering.service_id,p_coach_service_offering_id,p_service_request_id,p_start_at,p_end_at,p_timezone,'requested',p_client_notes) returning * into v_booking;
 insert into public.marketplace_booking_events(booking_id,event_type,actor_type,actor_id,event_data) values(v_booking.id,'requested','client',auth.uid(),jsonb_build_object('source','coach_profile'));
 return jsonb_build_object('id',v_booking.id,'booking_status',v_booking.booking_status);
end; $function$
