-- Reference snapshot only; captured from pg_get_functiondef on 2026-10-29 UTC.
-- NOT a migration and NOT safe to execute as a batch. Dependencies, ownership, ACLs,
-- extension/platform objects and order have not been reconstructed or rehearsed.
-- Project: ufmhrmzumqkjvaezrmxf. Secrets-pattern scan found no matches before commit.

CREATE OR REPLACE FUNCTION public.accept_coach_marketplace_agreements()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_coach_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select id into v_coach_id from public.coaches where profile_id=auth.uid();
 if v_coach_id is null then raise exception 'Coach profile not found'; end if;
 insert into public.coach_marketplace_onboarding(coach_id,required_agreements_accepted,agreements_accepted_at,updated_at)
 values(v_coach_id,true,now(),now())
 on conflict(coach_id) do update set required_agreements_accepted=true,agreements_accepted_at=coalesce(public.coach_marketplace_onboarding.agreements_accepted_at,now()),updated_at=now();
 insert into public.coach_marketplace_activation_events(coach_id,event_type,actor_type,actor_id) values(v_coach_id,'onboarding_started','coach',auth.uid());
 return public.check_coach_marketplace_activation_eligibility(v_coach_id);
end $function$


CREATE OR REPLACE FUNCTION public.activate_ai_configuration_version(p_version_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v public.ai_configuration_versions%rowtype; r public.ai_configuration_registry%rowtype; prev integer;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into v from public.ai_configuration_versions where id=p_version_id for update; if not found then raise exception 'Configuration version not found'; end if;
 if v.status<>'approved' then raise exception 'Only approved configurations can be activated'; end if;
 select * into r from public.ai_configuration_registry where id=v.registry_id for update;
 prev:=r.active_version;
 update public.ai_configuration_versions set status='deprecated',deprecated_at=now() where registry_id=r.id and status='active' and version<>v.version;
 update public.ai_configuration_versions set status='active',activated_at=now() where id=v.id;
 update public.ai_configuration_registry set active_version=v.version,updated_at=now() where id=r.id;
 insert into public.ai_configuration_change_log(registry_id,version_id,action,previous_version,new_version,actor_id,notes) values(r.id,v.id,'activated',prev,v.version,u,p_notes);
 return jsonb_build_object('registry_id',r.id,'active_version',v.version,'previous_version',prev,'status','active');
end; $function$


CREATE OR REPLACE FUNCTION public.activate_coach_on_marketplace(p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_check jsonb; v_eligible boolean; v_agreed boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('staff','admin')) then raise exception 'Staff or admin authorization required'; end if;
 select required_agreements_accepted into v_agreed from public.coach_marketplace_onboarding where coach_id=p_coach_id;
 v_check:=public.check_coach_marketplace_activation_eligibility(p_coach_id);
 v_eligible:=coalesce((v_check->>'eligible')::boolean,false) and coalesce(v_agreed,false);
 if not coalesce(v_agreed,false) then v_check:=v_check || jsonb_build_object('blocker','required_agreements_not_accepted'); end if;
 if not v_eligible then return v_check || jsonb_build_object('activated',false); end if;
 update public.coach_marketplace_profiles set marketplace_status='active',verification_status='verified',updated_at=now() where coach_id=p_coach_id;
 update public.coaches set application_status='active',verified_at=coalesce(verified_at,now()),approved_at=coalesce(approved_at,now()),updated_at=now() where id=p_coach_id;
 update public.coach_marketplace_onboarding set onboarding_status='active',eligible_for_activation=true,last_reviewed_by=auth.uid(),last_reviewed_at=now(),updated_at=now() where coach_id=p_coach_id;
 insert into public.coach_marketplace_activation_events(coach_id,event_type,actor_type,actor_id,event_data) values(p_coach_id,'activated','staff',auth.uid(),v_check);
 return v_check || jsonb_build_object('activated',true);
end $function$


CREATE OR REPLACE FUNCTION public.add_ai_output_provenance(p_output_version_id uuid, p_provenance_type text, p_source_id uuid DEFAULT NULL::uuid, p_source_location text DEFAULT NULL::text, p_claim_path text DEFAULT NULL::text, p_claim text DEFAULT NULL::text, p_support_type text DEFAULT NULL::text, p_confidence numeric DEFAULT NULL::numeric, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized AI review access required'; end if;
 if p_provenance_type not in ('document','evidence','profile','service_request','configuration','human_review','previous_output','external_source','other') then raise exception 'Invalid provenance type'; end if;
 insert into public.ai_output_provenance(output_version_id,provenance_type,source_id,source_location,claim_path,claim,support_type,confidence,metadata)
 values(p_output_version_id,p_provenance_type,p_source_id,p_source_location,p_claim_path,p_claim,p_support_type,p_confidence,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 insert into public.ai_audit_events(event_type,actor_type,actor_id,output_version_id,event_data)
 values('output_provenance_added','user',u,p_output_version_id,jsonb_build_object('provenance_type',p_provenance_type,'source_id',p_source_id,'source_location',p_source_location));
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.admin_activate_coach(p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare role_name text; blockers jsonb:='[]'::jsonb; active_slots integer;
begin select role::text into role_name from public.profiles where id=auth.uid(); if role_name not in ('admin','staff') then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.coaches where id=p_coach_id and application_status='approved') then raise exception 'Coach is not approved'; end if;
 if not exists(select 1 from public.coach_marketplace_profiles where coach_id=p_coach_id and verification_status='verified') then blockers:=blockers||jsonb_build_array('verification_required'); end if;
 if not exists(select 1 from public.coach_marketplace_onboarding where coach_id=p_coach_id and required_agreements_accepted=true) then blockers:=blockers||jsonb_build_array('agreements_required'); end if;
 select count(*) into active_slots from public.coach_marketplace_availability where coach_id=p_coach_id and active=true;
 if active_slots=0 then blockers:=blockers||jsonb_build_array('availability_required'); end if;
 if jsonb_array_length(blockers)>0 then update public.coach_marketplace_onboarding set eligible_for_activation=false,activation_blockers=blockers,eligibility_checked_at=now(),last_reviewed_by=auth.uid(),last_reviewed_at=now(),updated_at=now() where coach_id=p_coach_id; return jsonb_build_object('activated',false,'blockers',blockers); end if;
 update public.coach_marketplace_onboarding set eligible_for_activation=true,activation_blockers='[]'::jsonb,eligibility_checked_at=now(),last_reviewed_by=auth.uid(),last_reviewed_at=now(),updated_at=now() where coach_id=p_coach_id;
 update public.coach_marketplace_profiles set marketplace_status='active',updated_at=now() where coach_id=p_coach_id;
 return jsonb_build_object('activated',true,'coach_id',p_coach_id);
end;$function$


CREATE OR REPLACE FUNCTION public.admin_get_coach_id_for_application(p_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role public.user_role;
  v_coach_id uuid;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role not in ('admin'::public.user_role, 'staff'::public.user_role) then
    raise exception 'Not authorized';
  end if;

  select c.id into v_coach_id
  from public.coach_marketplace_applications a
  join public.coaches c on c.profile_id = a.applicant_user_id
  where a.id = p_application_id
  limit 1;

  return v_coach_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_get_coach_marketplace_queue()
 RETURNS TABLE(application_id uuid, coach_id uuid, display_name text, professional_title text, country text, timezone text, application_status text, verification_status text, marketplace_status text, onboarding_status text, required_agreements_accepted boolean, eligible_for_activation boolean, activation_blockers jsonb, active_availability_count bigint, semantic_profile_ready boolean, profile_completion_pct integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  select p.role::text into v_role from public.profiles p where p.id = auth.uid();
  if v_role not in ('admin','staff') then
    raise exception 'Not authorized';
  end if;

  return query
  select
    a.id,
    c.id,
    a.display_name,
    a.professional_title,
    a.country,
    a.timezone,
    a.application_status,
    cmp.verification_status,
    cmp.marketplace_status,
    o.onboarding_status,
    coalesce(o.required_agreements_accepted, false),
    coalesce(o.eligible_for_activation, false),
    coalesce(o.activation_blockers, '[]'::jsonb),
    coalesce(av.active_count, 0),
    (sp.embedding is not null),
    coalesce(cmp.profile_completion_pct, 0)
  from public.coach_marketplace_applications a
  left join public.coaches c on c.profile_id = a.applicant_user_id
  left join public.coach_marketplace_profiles cmp on cmp.coach_id = c.id
  left join public.coach_marketplace_onboarding o on o.coach_id = c.id
  left join public.coach_semantic_profiles sp on sp.coach_id = c.id
  left join lateral (
    select count(*)::bigint as active_count
    from public.coach_availability ca
    where ca.coach_id = c.id and ca.active = true
  ) av on true
  order by a.created_at desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_get_platform_analytics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_role text;
  result jsonb;
begin
  select role::text into caller_role from public.profiles where id = auth.uid();
  if caller_role <> 'admin' then
    raise exception 'Administrator access required';
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
        select
          currency,
          sum(gross_amount) gross,
          sum(platform_fee) platform_fee,
          sum(coach_earnings) coach_earnings,
          count(*) transactions
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
$function$


CREATE OR REPLACE FUNCTION public.admin_get_platform_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  caller_role text;
begin
  select role::text into caller_role from public.profiles where id = auth.uid();
  if caller_role not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'role',p.role::text,'full_name',p.full_name,'email',p.email,'status',p.status,'country',p.country,'created_at',p.created_at) order by p.created_at desc) from public.profiles p), '[]'::jsonb),
    'counts', jsonb_build_object(
      'users', (select count(*) from public.profiles),
      'clients', (select count(*) from public.profiles where role::text='client'),
      'coaches', (select count(*) from public.profiles where role::text='coach'),
      'staff', (select count(*) from public.profiles where role::text='staff'),
      'admins', (select count(*) from public.profiles where role::text='admin'),
      'active_coaches', (select count(*) from public.coaches where application_status::text='active'),
      'coach_applications', (select count(*) from public.coach_marketplace_applications),
      'active_clients', (select count(*) from public.clients where status::text='active'),
      'active_services', (select count(*) from public.coach_service_offerings where active=true),
      'bookings', (select count(*) from public.marketplace_booking_requests),
      'transactions', (select count(*) from public.marketplace_transactions)
    ),
    'permissions', jsonb_build_object(
      'admin', jsonb_build_array(
        'full_platform_access','view_dashboard','view_analytics','manage_users','assign_roles','manage_staff','manage_coaches','manage_clients',
        'manage_applications','manage_bookings','manage_services','manage_offerings','manage_content','manage_blog','manage_comments',
        'manage_ai_agents','manage_ai_governance','manage_finance','manage_payments','manage_payouts','manage_risk_and_disputes',
        'manage_notifications','manage_support','manage_website_settings','manage_integrations','view_audit'
      ),
      'staff', jsonb_build_array('view_dashboard','manage_coaches','manage_clients','manage_bookings','manage_services','view_payments','view_audit'),
      'coach', jsonb_build_array('manage_own_profile','manage_own_services','manage_own_availability','manage_own_bookings','view_own_earnings'),
      'client', jsonb_build_array('manage_own_profile','discover_coaches','manage_own_bookings','manage_own_payments','view_own_progress')
    )
  ) into result;
  return result;
end; $function$


CREATE OR REPLACE FUNCTION public.admin_get_platform_operations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; out jsonb;
begin
 select role::text into r from public.profiles where id=auth.uid();
 if r <> 'admin' then raise exception 'Administrator access required'; end if;
 select jsonb_build_object(
  'profiles',coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (select jsonb_build_object('id',p.id,'role',p.role::text,'full_name',p.full_name,'email',p.email,'status',p.status,'country',p.country,'timezone',p.timezone,'created_at',p.created_at) x from public.profiles p limit 500)s),'[]'::jsonb),
  'clients',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',c.id,'profile_id',c.profile_id,'name',p.full_name,'email',p.email,'status',c.status::text,'preferred_coach_id',c.preferred_coach_id,'created_at',c.created_at) x from public.clients c join public.profiles p on p.id=c.profile_id order by c.created_at desc limit 500)s),'[]'::jsonb),
  'coaches',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',c.id,'profile_id',c.profile_id,'name',p.full_name,'email',p.email,'professional_title',c.professional_title,'application_status',c.application_status::text,'marketplace_status',cmp.marketplace_status,'verification_status',cmp.verification_status,'active',cmp.marketplace_status='active','created_at',c.created_at) x from public.coaches c join public.profiles p on p.id=c.profile_id left join public.coach_marketplace_profiles cmp on cmp.coach_id=c.id order by c.created_at desc limit 500)s),'[]'::jsonb),
  'applications',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',a.id,'applicant_user_id',a.applicant_user_id,'display_name',a.display_name,'professional_title',a.professional_title,'country',a.country,'timezone',a.timezone,'application_status',a.application_status,'agreements',a.required_agreements_accepted,'created_at',a.created_at) x from public.coach_marketplace_applications a where lower(coalesce(a.application_status,'')) in ('submitted','pending','under_review') order by a.created_at desc limit 500)s),'[]'::jsonb),
  'services',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug,'category',s.category,'description',s.description,'price',s.price,'currency',s.currency,'active',s.active,'created_at',s.created_at) x from public.services s order by s.created_at desc limit 500)s),'[]'::jsonb),
  'offerings',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',o.id,'coach_id',o.coach_id,'coach_name',p.full_name,'service_id',o.service_id,'title',o.title,'price',o.price,'currency',o.currency,'duration_minutes',o.duration_minutes,'delivery_mode',o.delivery_mode,'active',o.active) x from public.coach_service_offerings o join public.coaches c on c.id=o.coach_id join public.profiles p on p.id=c.profile_id order by o.created_at desc limit 500)s),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',b.id,'client_id',b.client_id,'client_name',cp.full_name,'coach_id',b.coach_id,'coach_name',kp.full_name,'service_id',b.service_id,'offering_id',b.coach_service_offering_id,'start_at',b.requested_start,'end_at',b.requested_end,'timezone',b.timezone,'status',b.booking_status,'created_at',b.created_at) x from public.marketplace_booking_requests b left join public.clients cl on cl.id=b.client_id left join public.profiles cp on cp.id=cl.profile_id left join public.coaches co on co.id=b.coach_id left join public.profiles kp on kp.id=co.profile_id order by b.created_at desc limit 500)s),'[]'::jsonb),
  'transactions',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',t.id,'booking_id',t.booking_id,'client_id',t.client_id,'coach_id',t.coach_id,'gross_amount',t.gross_amount,'currency',t.currency,'payment_status',t.payment_status,'fulfillment_status',t.fulfillment_status,'release_eligibility',t.release_eligibility,'provider_key',t.provider_key,'provider_reference',t.provider_transaction_reference,'created_at',t.created_at) x from public.marketplace_transactions t order by t.created_at desc limit 500)s),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',pt.id,'transaction_id',pt.transaction_id,'provider_key',pt.provider_key,'reference',pt.provider_transaction_reference,'type',pt.transaction_type,'amount',pt.amount,'currency',pt.currency,'status',pt.status,'processed_at',pt.processed_at,'created_at',pt.created_at) x from public.marketplace_payment_transactions pt order by pt.created_at desc limit 500)s),'[]'::jsonb),
  'payouts',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',po.id,'transaction_id',po.transaction_id,'coach_id',po.coach_id,'coach_name',cp.full_name,'amount',po.payout_amount,'currency',po.currency,'status',po.status,'release_check_status',po.release_check_status,'release_check_reason',po.release_check_reason,'payout_account_id',po.payout_account_id,'account_last4',pa.account_number_last4,'bank_name',pa.bank_name,'recipient_ready',pa.recipient_code is not null and pa.verification_status='verified','approved_at',po.approved_at,'created_at',po.created_at) x from public.marketplace_payouts po join public.coaches co on co.id=po.coach_id join public.profiles cp on cp.id=co.profile_id left join public.coach_payout_accounts pa on pa.id=po.payout_account_id order by po.created_at desc limit 500)s),'[]'::jsonb),
  'disputes',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',d.id,'transaction_id',d.transaction_id,'opened_by',d.opened_by,'category',d.category,'reason',d.reason,'status',d.status,'amount_at_risk',d.amount_at_risk,'currency',d.currency,'created_at',d.created_at) x from public.marketplace_disputes d order by d.created_at desc limit 500)s),'[]'::jsonb),
  'refunds',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',f.id,'transaction_id',f.transaction_id,'requested_by',f.requested_by,'amount',f.amount,'reason',f.reason,'status',f.status,'created_at',f.created_at) x from public.marketplace_refund_requests f order by f.created_at desc limit 500)s),'[]'::jsonb),
  'providers',coalesce((select jsonb_agg(jsonb_build_object('id',pc.id,'provider_key',pc.provider_key,'display_name',pc.display_name,'active',pc.active,'supported_currencies',pc.supported_currencies,'supported_countries',pc.supported_countries,'capabilities',pc.capabilities) order by pc.created_at desc) from public.marketplace_payment_provider_configs pc),'[]'::jsonb)
 ) into out;
 return out;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_get_user_details(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; result jsonb;
begin
 select role::text into r from public.profiles where id=auth.uid();
 if r <> 'admin' then raise exception 'Administrator access required'; end if;
 select jsonb_build_object(
   'profile', (select to_jsonb(p) from public.profiles p where p.id=p_user_id),
   'client', (select to_jsonb(c) from public.clients c where c.profile_id=p_user_id),
   'coach', (select jsonb_build_object('core',to_jsonb(c),'marketplace',to_jsonb(cmp),'onboarding',to_jsonb(ob)) from public.coaches c left join public.coach_marketplace_profiles cmp on cmp.coach_id=c.id left join public.coach_marketplace_onboarding ob on ob.coach_id=c.id where c.profile_id=p_user_id),
   'application_history', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.coach_marketplace_applications a where a.applicant_user_id=p_user_id),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_review_coach_application(p_application_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.coach_marketplace_applications%rowtype;
  uid uuid := auth.uid();
  role_name text;
begin
  select role::text into role_name from public.profiles where id = uid;
  if role_name not in ('admin','staff') then raise exception 'Admin access required'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject'; end if;
  select * into a from public.coach_marketplace_applications where id=p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if p_decision='reject' then
    update public.coach_marketplace_applications set application_status='rejected',reviewed_at=now(),reviewer_id=uid,review_notes=p_notes where id=p_application_id;
    return jsonb_build_object('approved',false,'status','rejected');
  end if;
  if not a.required_agreements_accepted then raise exception 'Required agreements must be accepted'; end if;
  if coalesce(array_length(a.specializations,1),0)=0 then raise exception 'At least one specialization is required'; end if;
  if coalesce(array_length(a.coaching_formats,1),0)=0 then raise exception 'At least one coaching format is required'; end if;
  if nullif(trim(a.display_name),'') is null or nullif(trim(a.professional_title),'') is null then raise exception 'Display name and professional title are required'; end if;

  insert into public.profiles(id,role,full_name,email,country,timezone,bio,linkedin_url)
  values(a.applicant_user_id,'coach',a.display_name,(select u.email from auth.users u where u.id=a.applicant_user_id),a.country,a.timezone,a.bio,a.linkedin_url)
  on conflict(id) do update set role='coach',full_name=excluded.full_name,email=coalesce(excluded.email,public.profiles.email),country=excluded.country,timezone=excluded.timezone,bio=excluded.bio,linkedin_url=excluded.linkedin_url,updated_at=now();

  insert into public.coaches(profile_id,professional_title,professional_bio,years_experience,coaching_experience_years,methodology,languages,credentials,linkedin_url,website_url,availability_summary,timezone,application_status,verified_at,approved_at)
  values(a.applicant_user_id,a.professional_title,a.professional_bio,a.years_experience,a.coaching_experience_years,a.methodology,a.languages,a.credentials,a.linkedin_url,a.website_url,a.availability_summary,a.timezone,'approved',now(),now())
  on conflict(profile_id) do update set professional_title=excluded.professional_title,professional_bio=excluded.professional_bio,years_experience=excluded.years_experience,coaching_experience_years=excluded.coaching_experience_years,methodology=excluded.methodology,languages=excluded.languages,credentials=excluded.credentials,linkedin_url=excluded.linkedin_url,website_url=excluded.website_url,availability_summary=excluded.availability_summary,timezone=excluded.timezone,application_status='approved',verified_at=now(),approved_at=now(),updated_at=now();

  insert into public.coach_marketplace_profiles(coach_id,display_name,headline,bio,specializations,coaching_formats,languages,timezone,country,years_coaching,verification_status,marketplace_status,profile_completion_pct)
  select c.id,a.display_name,a.headline,a.bio,a.specializations,a.coaching_formats,a.languages,a.timezone,a.country,a.coaching_experience_years,'verified','draft',greatest(85,coalesce(cmp.profile_completion_pct,0))
  from public.coaches c left join public.coach_marketplace_profiles cmp on cmp.coach_id=c.id where c.profile_id=a.applicant_user_id
  on conflict(coach_id) do update set display_name=excluded.display_name,headline=excluded.headline,bio=excluded.bio,specializations=excluded.specializations,coaching_formats=excluded.coaching_formats,languages=excluded.languages,timezone=excluded.timezone,country=excluded.country,years_coaching=excluded.years_coaching,verification_status='verified',marketplace_status=case when public.coach_marketplace_profiles.marketplace_status='active' then 'active' else 'draft' end,updated_at=now();

  insert into public.coach_marketplace_onboarding(coach_id,onboarding_status,required_agreements_accepted,agreements_accepted_at,eligible_for_activation,activation_blockers,last_reviewed_by,last_reviewed_at)
  select c.id,'verification',true,a.agreements_accepted_at,false,jsonb_build_array('availability_required'),uid,now() from public.coaches c where c.profile_id=a.applicant_user_id
  on conflict(coach_id) do update set onboarding_status=case when public.coach_marketplace_onboarding.onboarding_status='active' then 'active' else 'verification' end,required_agreements_accepted=true,agreements_accepted_at=a.agreements_accepted_at,eligible_for_activation=false,activation_blockers=jsonb_build_array('availability_required'),last_reviewed_by=uid,last_reviewed_at=now(),updated_at=now();

  update public.coach_marketplace_applications set application_status='approved',reviewed_at=now(),reviewer_id=uid,review_notes=p_notes where id=p_application_id;
  return jsonb_build_object('approved',true,'status','approved');
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_review_marketplace_payout(p_payout_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_p public.marketplace_payouts%rowtype;
  v_account public.coach_payout_accounts%rowtype;
  v_check text;
begin
  select role::text into v_role from public.profiles where id=auth.uid();
  if v_role <> 'admin' then raise exception 'Administrator access required'; end if;
  if p_action not in ('check','approve') then raise exception 'Unsupported payout action'; end if;
  select * into v_p from public.marketplace_payouts where id=p_payout_id for update;
  if not found then raise exception 'Payout not found'; end if;
  if v_p.status in ('paid','processing','cancelled') then raise exception 'Payout cannot be reviewed in its current status'; end if;
  if v_p.payout_account_id is null then
    update public.marketplace_payouts set release_check_status='blocked', release_check_reason='Coach payout account is not configured.', release_checked_at=now(), release_checked_by=auth.uid(), status='on_hold', updated_at=now() where id=p_payout_id;
    return jsonb_build_object('status','blocked','payout_id',p_payout_id,'message','Coach payout account is not configured.');
  end if;
  select * into v_account from public.coach_payout_accounts where id=v_p.payout_account_id;
  if not found or v_account.verification_status <> 'verified' or v_account.recipient_code is null or v_account.is_default is not true then
    update public.marketplace_payouts set release_check_status='blocked', release_check_reason='Verified default payout account with recipient code is required.', release_checked_at=now(), release_checked_by=auth.uid(), status='on_hold', updated_at=now() where id=p_payout_id;
    return jsonb_build_object('status','blocked','payout_id',p_payout_id,'message','Verified default payout account with recipient code is required.');
  end if;
  v_check := public.check_marketplace_payout_release(p_payout_id);
  if v_check <> 'eligible' then
    return jsonb_build_object('status','blocked','payout_id',p_payout_id,'message','Payout release controls blocked this payout.');
  end if;
  if p_action='check' then
    return jsonb_build_object('status','eligible','payout_id',p_payout_id,'message','Payout passed release checks.');
  end if;
  update public.marketplace_payouts
    set release_check_status='approved', approved_at=now(), approved_by=auth.uid(), updated_at=now()
  where id=p_payout_id;
  return jsonb_build_object('status','approved','payout_id',p_payout_id,'message','Payout approved for release.');
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_role text;
  target_role text;
begin
  select role::text into caller_role from public.profiles where id=auth.uid();
  if caller_role <> 'admin' then raise exception 'Admin access required'; end if;
  if p_role not in ('client','coach','staff','admin') then raise exception 'Invalid role'; end if;
  if p_user_id = auth.uid() then raise exception 'Administrators cannot change their own role'; end if;
  select role::text into target_role from public.profiles where id=p_user_id for update;
  if target_role is null then raise exception 'User profile not found'; end if;
  update public.profiles set role=p_role::user_role, updated_at=now() where id=p_user_id;
  return jsonb_build_object('updated',true,'user_id',p_user_id,'role',p_role);
end; $function$


CREATE OR REPLACE FUNCTION public.admin_update_booking_status(p_booking_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select role::text into r from profiles where id=auth.uid(); if r<>'admin' then raise exception 'Administrator access required'; end if; if p_status not in ('requested','confirmed','declined','cancelled','completed') then raise exception 'Invalid booking status'; end if; update marketplace_booking_requests set booking_status=p_status,coach_notes=coalesce(p_notes,coach_notes),updated_at=now() where id=p_booking_id; if not found then raise exception 'Booking not found'; end if; return jsonb_build_object('updated',true,'booking_id',p_booking_id,'status',p_status); end; $function$


CREATE OR REPLACE FUNCTION public.admin_update_client_status(p_client_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select role::text into r from profiles where id=auth.uid(); if r<>'admin' then raise exception 'Administrator access required'; end if; if p_status not in ('active','inactive','suspended') then raise exception 'Invalid client status'; end if; update clients set status=p_status::client_status,updated_at=now() where id=p_client_id; if not found then raise exception 'Client not found'; end if; return jsonb_build_object('updated',true,'client_id',p_client_id,'status',p_status); end; $function$


CREATE OR REPLACE FUNCTION public.admin_update_coach_marketplace_status(p_coach_id uuid, p_marketplace_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select role::text into r from profiles where id=auth.uid(); if r<>'admin' then raise exception 'Administrator access required'; end if; if p_marketplace_status not in ('pending_activation','active','inactive','suspended') then raise exception 'Invalid marketplace status'; end if; update coach_marketplace_profiles set marketplace_status=p_marketplace_status,updated_at=now() where coach_id=p_coach_id; if not found then raise exception 'Marketplace coach profile not found'; end if; return jsonb_build_object('updated',true,'coach_id',p_coach_id,'marketplace_status',p_marketplace_status); end; $function$


CREATE OR REPLACE FUNCTION public.admin_update_offering_status(p_offering_id uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select role::text into r from profiles where id=auth.uid(); if r<>'admin' then raise exception 'Administrator access required'; end if; update coach_service_offerings set active=p_active,updated_at=now() where id=p_offering_id; if not found then raise exception 'Offering not found'; end if; return jsonb_build_object('updated',true,'offering_id',p_offering_id,'active',p_active); end; $function$


CREATE OR REPLACE FUNCTION public.admin_update_payment_provider_status(p_provider_id uuid, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select role::text into r from profiles where id=auth.uid(); if r<>'admin' then raise exception 'Administrator access required'; end if; update marketplace_payment_provider_configs set active=p_active,updated_at=now() where id=p_provider_id; if not found then raise exception 'Payment provider not found'; end if; return jsonb_build_object('updated',true,'provider_id',p_provider_id,'active',p_active); end; $function$


CREATE OR REPLACE FUNCTION public.admin_update_profile_status(p_user_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select role::text into r from profiles where id=auth.uid(); if r<>'admin' then raise exception 'Administrator access required'; end if; if p_status not in ('active','inactive','suspended') then raise exception 'Invalid status'; end if; update profiles set status=p_status,updated_at=now() where id=p_user_id; if not found then raise exception 'User not found'; end if; return jsonb_build_object('updated',true,'user_id',p_user_id,'status',p_status); end; $function$


CREATE OR REPLACE FUNCTION public.admin_update_service(p_service_id uuid, p_name text, p_category text, p_description text, p_price numeric, p_currency text, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select role::text into r from profiles where id=auth.uid(); if r<>'admin' then raise exception 'Administrator access required'; end if; if nullif(trim(p_name),'') is null or p_price<0 then raise exception 'Invalid service details'; end if; update services set name=trim(p_name),category=nullif(trim(p_category),''),description=p_description,price=p_price,currency=upper(p_currency),active=p_active,updated_at=now() where id=p_service_id; if not found then raise exception 'Service not found'; end if; return jsonb_build_object('updated',true,'service_id',p_service_id); end; $function$


CREATE OR REPLACE FUNCTION public.ai_check_orchestration_budget(p_service_scope text, p_workflow text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
 v_budget record;
 v_spend numeric := 0;
 v_util numeric := 0;
begin
 select b.* into v_budget
 from public.ai_usage_budgets b
 where b.active=true
   and (
     b.scope_type='global'
     or (b.scope_type='service_scope' and b.scope_key=p_service_scope)
     or (b.scope_type='workflow' and b.scope_key=coalesce(p_workflow,''))
     or (b.scope_type='client' and b.scope_key=coalesce(p_client_id::text,''))
   )
 order by case b.scope_type
   when 'client' then 1
   when 'workflow' then 2
   when 'service_scope' then 3
   when 'global' then 4
   else 5
 end
 limit 1;
 if not found then
   return jsonb_build_object('allowed',true,'reason','no_active_budget','utilization',0);
 end if;
 if v_budget.period_type='daily' then
   select coalesce(sum(e.estimated_cost_usd),0) into v_spend
   from public.ai_usage_events e
   where e.created_at >= date_trunc('day',now())
     and (
       v_budget.scope_type='global'
       or (v_budget.scope_type='service_scope' and e.service_scope=v_budget.scope_key)
       or (v_budget.scope_type='workflow' and e.workflow=v_budget.scope_key)
       or (v_budget.scope_type='client' and e.client_id::text=v_budget.scope_key)
     );
 elsif v_budget.period_type='monthly' then
   select coalesce(sum(e.estimated_cost_usd),0) into v_spend
   from public.ai_usage_events e
   where e.created_at >= date_trunc('month',now())
     and (
       v_budget.scope_type='global'
       or (v_budget.scope_type='service_scope' and e.service_scope=v_budget.scope_key)
       or (v_budget.scope_type='workflow' and e.workflow=v_budget.scope_key)
       or (v_budget.scope_type='client' and e.client_id::text=v_budget.scope_key)
     );
 else
   select coalesce(sum(e.estimated_cost_usd),0) into v_spend
   from public.ai_usage_events e
   where (
     v_budget.scope_type='global'
     or (v_budget.scope_type='service_scope' and e.service_scope=v_budget.scope_key)
     or (v_budget.scope_type='workflow' and e.workflow=v_budget.scope_key)
     or (v_budget.scope_type='client' and e.client_id::text=v_budget.scope_key)
   );
 end if;
 if coalesce(v_budget.budget_usd,0) > 0 then v_util := v_spend / v_budget.budget_usd; end if;
 return jsonb_build_object(
   'allowed',v_util < coalesce(v_budget.block_threshold,1),
   'budget_id',v_budget.id,
   'budget_usd',v_budget.budget_usd,
   'spent_usd',v_spend,
   'utilization',v_util,
   'warn',v_util >= coalesce(v_budget.warn_threshold,.8),
   'blocked',v_util >= coalesce(v_budget.block_threshold,1)
 );
end;
$function$


CREATE OR REPLACE FUNCTION public.ai_create_orchestration_run(p_workflow_key text, p_request_id uuid, p_input_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
 v_workflow public.ai_workflows%rowtype;
 v_request public.service_requests%rowtype;
 v_client public.clients%rowtype;
 v_budget jsonb;
 v_run uuid;
 v_role text;
begin
 select * into v_workflow from public.ai_workflows where workflow_key=p_workflow_key and status in ('approved','production') limit 1;
 if not found then raise exception 'Workflow is not approved for execution'; end if;
 select * into v_request from public.service_requests where id=p_request_id;
 if not found then raise exception 'Service request not found'; end if;
 select * into v_client from public.clients where id=v_request.client_id;
 if not found then raise exception 'Client not found'; end if;
 select role into v_role from public.profiles where id=auth.uid() and status='active';
 if v_role is null or v_role not in ('client','coach','staff','admin') then raise exception 'Unauthorized'; end if;
 if v_role='client' and v_client.profile_id<>auth.uid() then raise exception 'Unauthorized client request'; end if;
 if v_role='coach' and v_request.assigned_coach<>auth.uid() then raise exception 'Unauthorized coach request'; end if;
 v_budget := public.ai_check_orchestration_budget(v_workflow.service_scope,v_workflow.workflow_key,v_request.client_id);
 if coalesce((v_budget->>'allowed')::boolean,false)=false then
   insert into public.ai_orchestration_runs(workflow_id,request_id,client_id,service_scope,status,cost_status,input_snapshot,error_code,error_message)
   values(v_workflow.id,p_request_id,v_request.client_id,v_workflow.service_scope,'blocked',v_budget->>'blocked',coalesce(p_input_snapshot,'{}'::jsonb),'BUDGET_BLOCKED','AI usage budget threshold reached') returning id into v_run;
   return v_run;
 end if;
 insert into public.ai_orchestration_runs(workflow_id,request_id,client_id,service_scope,status,cost_status,input_snapshot,started_at)
 values(v_workflow.id,p_request_id,v_request.client_id,v_workflow.service_scope,'running',case when coalesce((v_budget->>'warn')::boolean,false) then 'warning' else 'ok' end,coalesce(p_input_snapshot,'{}'::jsonb),now()) returning id into v_run;
 update public.ai_orchestration_runs r set current_step_id=(select s.id from public.ai_workflow_steps s where s.workflow_id=v_workflow.id order by s.step_order limit 1),updated_at=now() where r.id=v_run;
 return v_run;
end;
$function$


CREATE OR REPLACE FUNCTION public.ai_get_usage_budget_status(p_scope_type text, p_scope_key text, p_period_start timestamp with time zone, p_period_end timestamp with time zone)
 RETURNS TABLE(budget_id uuid, budget_name text, budget_usd numeric, observed_cost_usd numeric, utilization numeric, warning boolean, blocked boolean)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select b.id,
         b.name,
         b.budget_usd,
         coalesce(sum(e.estimated_cost_usd),0) as observed_cost_usd,
         case when b.budget_usd = 0 then 1 else coalesce(sum(e.estimated_cost_usd),0) / b.budget_usd end as utilization,
         (case when b.budget_usd = 0 then 1 else coalesce(sum(e.estimated_cost_usd),0) / b.budget_usd end) >= b.warn_threshold as warning,
         (case when b.budget_usd = 0 then 1 else coalesce(sum(e.estimated_cost_usd),0) / b.budget_usd end) >= b.block_threshold as blocked
  from public.ai_usage_budgets b
  left join public.ai_usage_events e
    on ((b.scope_type = 'global') or (b.scope_type = p_scope_type and coalesce(b.scope_key,'') = coalesce(p_scope_key,'')))
   and e.created_at >= p_period_start and e.created_at < p_period_end
  where b.active = true
    and (b.scope_type = 'global' or (b.scope_type = p_scope_type and coalesce(b.scope_key,'') = coalesce(p_scope_key,'')))
  group by b.id, b.name, b.budget_usd, b.warn_threshold, b.block_threshold;
$function$


CREATE OR REPLACE FUNCTION public.ai_governance_calendly_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$ declare v_role text; begin select p.role::text into v_role from public.profiles p where p.id=auth.uid() and p.status='active'; if v_role not in ('admin','staff') then raise exception 'Staff/Admin access required'; end if; return jsonb_build_object('active',(select count(*) from public.calendly_connections where active=true),'oauth',(select count(*) from public.calendly_oauth_states where expires_at>now())); end; $function$


CREATE OR REPLACE FUNCTION public.ai_orchestration_dashboard()
 RETURNS TABLE(run_id uuid, workflow_key text, ai_system text, request_id uuid, client_id uuid, status text, current_step text, cost_status text, created_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
 select r.id,w.workflow_key,w.ai_system,r.request_id,r.client_id,r.status,s.name,r.cost_status,r.created_at
 from public.ai_orchestration_runs r join public.ai_workflows w on w.id=r.workflow_id left join public.ai_workflow_steps s on s.id=r.current_step_id;
$function$


CREATE OR REPLACE FUNCTION public.ai_record_governance_event(p_entity_type text, p_entity_id uuid, p_event_type text, p_previous_status text, p_new_status text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_id uuid;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role in ('staff','admin')) then
    raise exception 'Staff or admin access required';
  end if;
  insert into public.ai_governance_events(entity_type,entity_id,event_type,previous_status,new_status,actor_id,metadata)
  values(p_entity_type,p_entity_id,p_event_type,p_previous_status,p_new_status,auth.uid(),coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.ai_record_orchestration_step(p_run_id uuid, p_step_key text, p_status text, p_output jsonb DEFAULT '{}'::jsonb, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
 v_run public.ai_orchestration_runs%rowtype;
 v_step public.ai_workflow_steps%rowtype;
 v_next public.ai_workflow_steps%rowtype;
 v_role text;
begin
 select role into v_role from public.profiles where id=auth.uid() and status='active';
 if v_role is null or v_role not in ('coach','staff','admin') then raise exception 'Authorized staff or coach profile required'; end if;
 select * into v_run from public.ai_orchestration_runs where id=p_run_id;
 if not found then raise exception 'Orchestration run not found'; end if;
 if v_role='coach' and not exists(select 1 from public.service_requests sr where sr.id=v_run.request_id and sr.assigned_coach=auth.uid()) then raise exception 'Unauthorized coach run'; end if;
 select * into v_step from public.ai_workflow_steps where workflow_id=v_run.workflow_id and step_key=p_step_key;
 if not found then raise exception 'Workflow step not found'; end if;
 select * into v_next from public.ai_workflow_steps where workflow_id=v_run.workflow_id and step_order>v_step.step_order order by step_order limit 1;
 update public.ai_orchestration_runs set output_snapshot=coalesce(output_snapshot,'{}'::jsonb)||jsonb_build_object(p_step_key,coalesce(p_output,'{}'::jsonb)), current_step_id=v_next.id, status=case when p_status in ('failed','blocked') then p_status when v_next.id is null then 'completed' when exists(select 1 from public.ai_workflow_steps s where s.id=v_next.id and s.step_type='human_review') then 'awaiting_human_review' else 'running' end, error_code=p_error_code,error_message=p_error_message,completed_at=case when v_next.id is null then now() else null end,updated_at=now() where id=p_run_id;
 return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.ai_start_orchestration_run(p_workflow_key text, p_request_id uuid, p_input_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
 v_workflow public.ai_workflows%rowtype;
 v_request public.service_requests%rowtype;
 v_client public.clients%rowtype;
 v_run uuid;
 v_actor_role text;
begin
 select * into v_workflow from public.ai_workflows where workflow_key = p_workflow_key and status in ('approved','production') limit 1;
 if not found then raise exception 'Workflow is not approved for execution'; end if;
 select * into v_request from public.service_requests where id = p_request_id;
 if not found then raise exception 'Service request not found'; end if;
 select * into v_client from public.clients where id = v_request.client_id;
 if not found then raise exception 'Client not found'; end if;
 select role into v_actor_role from public.profiles where id = auth.uid() and status = 'active';
 if v_actor_role is null then raise exception 'Active profile required'; end if;
 if v_actor_role not in ('client','coach','staff','admin') then raise exception 'Unauthorized'; end if;
 if v_actor_role = 'client' and v_client.profile_id <> auth.uid() then raise exception 'Unauthorized client request'; end if;
 if v_actor_role = 'coach' and not (v_request.assigned_coach = auth.uid()) then raise exception 'Unauthorized coach request'; end if;
 insert into public.ai_orchestration_runs(workflow_id,request_id,client_id,service_scope,status,input_snapshot,started_at)
 values(v_workflow.id,p_request_id,v_request.client_id,v_request.objective,'running',coalesce(p_input_snapshot,'{}'::jsonb),now()) returning id into v_run;
 update public.ai_orchestration_runs r set current_step_id=(select s.id from public.ai_workflow_steps s where s.workflow_id=v_workflow.id order by s.step_order limit 1), updated_at=now() where r.id=v_run;
 return v_run;
end;
$function$


CREATE OR REPLACE FUNCTION public.allocate_ai_usage_to_service(p_usage_event_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_event public.ai_usage_events%rowtype; v_delivery_id uuid; v_service_id uuid; v_alloc_id uuid;
begin
 if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role=any(array['staff'::user_role,'admin'::user_role,'coach'::user_role])) then raise exception 'Not authorized'; end if;
 select * into v_event from public.ai_usage_events where id=p_usage_event_id;
 if not found then raise exception 'Usage event not found'; end if;
 select adr.id,adr.service_id into v_delivery_id,v_service_id
 from public.ai_service_delivery_runs adr
 join public.ai_service_workflow_executions awe on awe.delivery_run_id=adr.id
 where awe.id=v_event.run_id limit 1;
 if v_delivery_id is null then return null; end if;
 select id into v_alloc_id from public.ai_service_cost_allocations where usage_event_id=p_usage_event_id limit 1;
 if v_alloc_id is not null then return v_alloc_id; end if;
 insert into public.ai_service_cost_allocations(delivery_run_id,service_id,usage_event_id,ai_cost_usd,input_tokens,output_tokens,total_tokens,allocation_method,allocation_confidence,metadata)
 values(v_delivery_id,v_service_id,p_usage_event_id,coalesce(v_event.estimated_cost_usd,0),v_event.input_tokens,v_event.output_tokens,v_event.total_tokens,'direct_execution',1.0,jsonb_build_object('model',v_event.model_name,'provider',v_event.provider)) returning id into v_alloc_id;
 return v_alloc_id;
end; $function$


CREATE OR REPLACE FUNCTION public.apply_approved_evidence_mapping(p_mapping_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  m public.evidence_mappings;
begin
  select * into m from public.evidence_mappings where id = p_mapping_id and mapping_status = 'approved';
  if not found then raise exception 'Approved evidence mapping not found'; end if;

  if not exists (
    select 1 from public.evidence_items e
    where e.id = m.evidence_item_id and e.verification_status = 'verified'
  ) then
    raise exception 'Evidence must be verified before mapping can be applied';
  end if;

  update public.evidence_mappings
    set mapping_status='applied', mapped_at=coalesce(mapped_at, now()), updated_at=now()
    where id=p_mapping_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_approved_profile_rollback(p_rollback_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.career_profile_rollback_requests%rowtype; v public.career_profile_versions%rowtype; cp public.career_profiles%rowtype; u uuid:=auth.uid(); new_version integer;
begin
 if not exists(select 1 from public.profiles p where p.id=u and p.status='active' and p.role in ('coach','staff','admin')) then raise exception 'Authorized staff access required'; end if;
 select * into r from public.career_profile_rollback_requests where id=p_rollback_id for update;
 if not found then raise exception 'Rollback request not found'; end if;
 if r.status<>'approved' then raise exception 'Rollback request must be approved'; end if;
 select * into v from public.career_profile_versions where career_profile_id=r.career_profile_id and version=r.target_version;
 if not found then raise exception 'Target version not found'; end if;
 select * into cp from public.career_profiles where id=r.career_profile_id for update;
 new_version:=coalesce(cp.profile_version,0)+1;
 update public.career_profiles set professional_summary=v.snapshot->>'professional_summary',current_level=v.snapshot->>'current_level',target_roles=coalesce(array(select jsonb_array_elements_text(v.snapshot->'target_roles')),'{}'),target_industries=coalesce(array(select jsonb_array_elements_text(v.snapshot->'target_industries')),'{}'),target_locations=coalesce(array(select jsonb_array_elements_text(v.snapshot->'target_locations')),'{}'),career_interests=coalesce(array(select jsonb_array_elements_text(v.snapshot->'career_interests')),'{}'),leadership_experience=v.snapshot->>'leadership_experience',development_gaps=coalesce(array(select jsonb_array_elements_text(v.snapshot->'development_gaps')),'{}'),career_stage=v.snapshot->>'career_stage',current_job_title=v.snapshot->>'current_job_title',current_industry=v.snapshot->>'current_industry',current_location=v.snapshot->>'current_location',target_industry=v.snapshot->>'target_industry',target_role=v.snapshot->>'target_role',target_location=v.snapshot->>'target_location',interests=v.snapshot->>'interests',achievements=v.snapshot->>'achievements',certifications=v.snapshot->>'certifications',portfolio_evidence=v.snapshot->>'portfolio_evidence',strengths_summary=v.snapshot->>'strengths_summary',development_gaps_summary=v.snapshot->>'development_gaps_summary',profile_version=new_version,human_reviewed=true,human_reviewed_by=u,human_reviewed_at=now(),updated_at=now() where id=cp.id;
 insert into public.career_profile_versions(client_id,career_profile_id,version,snapshot,change_summary,change_type,created_by) values(cp.client_id,cp.id,new_version,to_jsonb((select c from public.career_profiles c where c.id=cp.id)),'Rollback to version '||r.target_version,'rollback',u);
 insert into public.profile_change_history(client_id,career_profile_id,proposal_id,target_entity,target_record_id,target_field,old_value,new_value,applied_by,applied_at,metadata) values(cp.client_id,cp.id,(select id from public.profile_sync_proposals where false limit 1),'career_profile',cp.id,'rollback',to_jsonb(cp),v.snapshot,u,now(),jsonb_build_object('target_version',r.target_version,'rollback_request_id',r.id));
 update public.career_profile_rollback_requests set status='applied',reviewed_by=u,reviewed_at=coalesce(reviewed_at,now()),applied_at=now(),updated_at=now() where id=r.id;
 return jsonb_build_object('rollback_id',r.id,'status','applied','restored_version',r.target_version,'new_current_version',new_version);
end; $function$


CREATE OR REPLACE FUNCTION public.apply_approved_profile_sync_proposal(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.profile_sync_proposals%rowtype; v_user uuid:=auth.uid(); v_profile_id uuid; v_old jsonb; v_version uuid;
begin
 if not exists(select 1 from public.profiles where id=v_user and status='active' and role in ('coach','admin','staff')) then raise exception 'Authorized staff access required'; end if;
 select * into v from public.profile_sync_proposals where id=p_proposal_id for update;
 if not found then raise exception 'Proposal not found'; end if;
 if v.status<>'approved' then raise exception 'Only approved proposals can be applied'; end if;
 if v.evidence_item_id is not null and not exists(select 1 from public.evidence_items where id=v.evidence_item_id and verification_status='verified') then raise exception 'Source evidence is no longer verified'; end if;
 if v.target_entity='career_profile' then
   select cp.id,to_jsonb(cp) into v_profile_id,v_old from public.career_profiles cp where cp.id=coalesce(v.target_record_id,(select id from public.career_profiles where client_id=v.client_id and is_current=true order by updated_at desc limit 1)) for update;
   if v_profile_id is null then raise exception 'Current career profile not found'; end if;
   insert into public.career_profile_versions(client_id,career_profile_id,version,snapshot,change_summary,change_type,source_proposal_id,source_evidence_item_id,created_by)
   select v.client_id,v_profile_id,coalesce((select max(version) from public.career_profile_versions where career_profile_id=v_profile_id),0)+1,v_old,'Pre-change snapshot: '||coalesce(v.target_field,'profile update'),'evidence_sync',v.id,v.evidence_item_id,v_user;
   update public.career_profiles cp set professional_summary=case when v.target_field='professional_summary' then v.proposed_value->>'value' else cp.professional_summary end,leadership_experience=case when v.target_field='leadership_experience' then v.proposed_value->>'value' else cp.leadership_experience end,target_role=case when v.target_field='target_role' then v.proposed_value->>'value' else cp.target_role end,target_industry=case when v.target_field='target_industry' then v.proposed_value->>'value' else cp.target_industry end,target_location=case when v.target_field='target_location' then v.proposed_value->>'value' else cp.target_location end,current_job_title=case when v.target_field='current_job_title' then v.proposed_value->>'value' else cp.current_job_title end,current_industry=case when v.target_field='current_industry' then v.proposed_value->>'value' else cp.current_industry end,current_location=case when v.target_field='current_location' then v.proposed_value->>'value' else cp.current_location end,last_intelligence_run_at=now(),updated_at=now(),profile_version=coalesce(cp.profile_version,0)+1 where cp.id=v_profile_id;
   insert into public.profile_change_history(client_id,request_id,career_profile_id,proposal_id,evidence_item_id,target_entity,target_record_id,target_field,old_value,new_value,applied_by,applied_at,metadata) values(v.client_id,v.request_id,v_profile_id,v.id,v.evidence_item_id,v.target_entity,v_profile_id,v.target_field,v_old,v.proposed_value,v_user,now(),jsonb_build_object('change_type','evidence_sync','confidence',v.confidence));
   insert into public.profile_sync_provenance(proposal_id,client_id,target_entity,target_record_id,target_field,source_evidence_item_id,source_document_id,source_location,applied_value,applied_by,applied_at)
   select v.id,v.client_id,v.target_entity,v_profile_id,v.target_field,v.evidence_item_id,e.document_id,coalesce(ei.claim,''),v.proposed_value,v_user,now() from public.evidence_items e left join public.evidence_items ei on ei.id=v.evidence_item_id where e.id=v.evidence_item_id;
 else raise exception 'Target entity % requires a dedicated typed sync handler before application',v.target_entity; end if;
 update public.profile_sync_proposals set status='applied',applied_at=now(),updated_at=now() where id=p_proposal_id;
 return jsonb_build_object('proposal_id',p_proposal_id,'status','applied','profile_version',coalesce((select profile_version from public.career_profiles where id=v_profile_id),0));
end; $function$


CREATE OR REPLACE FUNCTION public.apply_evidence_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$ begin update public.evidence_items set verification_status=new.decision, verified_by=new.reviewer_id, verified_at=now() where id=new.evidence_item_id; update public.document_facts df set verification_status=case when new.decision='approved' then 'verified' when new.decision='rejected' then 'rejected' else 'needs_clarification' end, updated_at=now() where exists (select 1 from public.evidence_items e where e.id=new.evidence_item_id and df.source_id=e.source_id and e.source_type='document_fact'); return new; end; $function$


CREATE OR REPLACE FUNCTION public.apply_marketplace_payment_webhook_state(p_webhook_event_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_uid uuid := (select auth.uid());
 v_event record;
 v_tx record;
 v_new_payment text;
 v_new_release text;
 v_prev_payment text;
 v_prev_release text;
 v_amount numeric;
 v_currency text;
 v_event_type text;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_uid and p.role in ('staff','admin')) then raise exception 'not_authorized'; end if;
 select * into v_event from public.marketplace_payment_webhook_events where id=p_webhook_event_id for update;
 if not found then raise exception 'webhook_event_not_found'; end if;
 if v_event.signature_verified is not true then raise exception 'webhook_signature_not_verified'; end if;
 if v_event.processing_status='processed' then return true; end if;
 if v_event.processing_status not in ('verified','received','failed') then raise exception 'webhook_not_processable'; end if;
 if v_event.transaction_id is null then raise exception 'transaction_reference_required'; end if;

 select * into v_tx from public.marketplace_transactions where id=v_event.transaction_id for update;
 if not found then raise exception 'transaction_not_found'; end if;

 v_event_type := lower(trim(v_event.event_type));
 v_prev_payment := v_tx.payment_status;
 v_prev_release := v_tx.release_eligibility;
 v_new_payment := v_prev_payment;
 v_new_release := v_prev_release;
 v_amount := nullif((v_event.payload->>'amount')::numeric,0);
 v_currency := coalesce(v_event.payload->>'currency',v_tx.currency);

 case v_event_type
   when 'payment_authorized' then
     if v_prev_payment not in ('pending','authorized') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment := 'authorized';
   when 'payment_funded', 'payment_succeeded' then
     if v_prev_payment not in ('pending','authorized','funded','held') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment := 'funded';
   when 'payment_held' then
     if v_prev_payment not in ('funded','held') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment := 'held';
   when 'payment_failed' then
     if v_prev_payment in ('released','refunded','partially_refunded') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment := 'failed';
     v_new_release := 'blocked';
   when 'payment_cancelled' then
     if v_prev_payment in ('released','refunded','partially_refunded') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment := 'cancelled';
     v_new_release := 'blocked';
   when 'payment_reversed' then
     if v_prev_payment in ('released','refunded') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment := 'failed';
     v_new_release := 'blocked';
   when 'payment_refunded' then
     if v_prev_payment not in ('funded','held','partially_refunded','refunded') then raise exception 'invalid_refund_transition'; end if;
     v_new_payment := 'refunded';
     v_new_release := 'blocked';
   when 'payment_partially_refunded' then
     if v_prev_payment not in ('funded','held','partially_refunded') then raise exception 'invalid_refund_transition'; end if;
     v_new_payment := 'partially_refunded';
     v_new_release := 'blocked';
   else
     raise exception 'unsupported_normalized_event_type:%', v_event_type;
 end case;

 if v_event_type in ('payment_funded','payment_succeeded','payment_held') and v_tx.fulfillment_status='completed' and v_tx.release_eligibility='blocked' then
   v_new_release := 'eligible';
 end if;

 if exists(select 1 from public.marketplace_payment_state_sync_events where webhook_event_id=p_webhook_event_id) then
   update public.marketplace_payment_webhook_events set processing_status='processed',processed_at=coalesce(processed_at,now()),error_message=null where id=p_webhook_event_id;
   return true;
 end if;

 insert into public.marketplace_payment_state_sync_events(webhook_event_id,transaction_id,normalized_event_type,previous_payment_status,new_payment_status,previous_release_eligibility,new_release_eligibility,applied_amount,currency)
 values(p_webhook_event_id,v_event.transaction_id,v_event_type,v_prev_payment,v_new_payment,v_prev_release,v_new_release,v_amount,v_currency);

 update public.marketplace_transactions
 set payment_status=v_new_payment, release_eligibility=v_new_release, updated_at=now(), metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('last_payment_webhook_event',p_webhook_event_id,'last_payment_webhook_type',v_event_type)
 where id=v_event.transaction_id;

 insert into public.marketplace_transaction_events(transaction_id,event_type,actor_type,actor_id,event_data)
 values(v_event.transaction_id,
   case v_event_type when 'payment_authorized' then 'payment_authorized' when 'payment_funded' then 'funded' when 'payment_succeeded' then 'funded' when 'payment_held' then 'held' when 'payment_failed' then 'payment_failed' when 'payment_cancelled' then 'cancelled' when 'payment_reversed' then 'payment_failed' when 'payment_refunded' then 'refunded' when 'payment_partially_refunded' then 'partial_refund' end,
   'payment_provider',null,jsonb_build_object('webhook_event_id',p_webhook_event_id,'provider_key',v_event.provider_key,'provider_event_reference',v_event.provider_event_reference,'amount',v_amount,'currency',v_currency));

 update public.marketplace_payment_webhook_events set processing_status='processed',processed_at=now(),error_message=null where id=p_webhook_event_id;
 return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_paystack_webhook_state(p_webhook_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_event record;
 v_tx record;
 v_type text;
 v_new_payment text;
 v_new_release text;
 v_amount numeric;
 v_currency text;
begin
 select * into v_event from public.marketplace_payment_webhook_events where id=p_webhook_event_id for update;
 if not found then raise exception 'webhook_event_not_found'; end if;
 if v_event.provider_key <> 'paystack' then raise exception 'unsupported_provider'; end if;
 if v_event.signature_verified is not true then raise exception 'webhook_signature_not_verified'; end if;
 if v_event.processing_status='processed' then return jsonb_build_object('processed',true,'duplicate',true); end if;
 if v_event.transaction_id is null then raise exception 'transaction_reference_required'; end if;
 select * into v_tx from public.marketplace_transactions where id=v_event.transaction_id for update;
 if not found then raise exception 'transaction_not_found'; end if;
 v_type:=lower(trim(v_event.event_type));
 v_amount:=nullif((v_event.payload->'data'->>'amount')::numeric,0);
 v_currency:=coalesce(nullif(v_event.payload->'data'->>'currency',''),v_tx.currency);
 if v_amount is not null and v_amount <> round(v_tx.gross_amount*100) then raise exception 'payment_amount_mismatch'; end if;
 if upper(v_currency) <> upper(v_tx.currency) then raise exception 'payment_currency_mismatch'; end if;
 v_new_payment:=v_tx.payment_status;
 v_new_release:=v_tx.release_eligibility;
 case v_type
   when 'charge.success' then
     if v_tx.payment_status not in ('pending','authorized','funded','held') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment:='funded';
   when 'charge.failed' then
     if v_tx.payment_status in ('released','refunded','partially_refunded') then raise exception 'invalid_payment_transition'; end if;
     v_new_payment:='failed'; v_new_release:='blocked';
   when 'refund.processed' then
     if v_tx.payment_status not in ('funded','held','partially_refunded','refunded') then raise exception 'invalid_refund_transition'; end if;
     v_new_payment:='refunded'; v_new_release:='blocked';
   else
     update public.marketplace_payment_webhook_events set processing_status='ignored',processed_at=now(),error_message=null where id=p_webhook_event_id;
     return jsonb_build_object('processed',false,'ignored',true,'event_type',v_type);
 end case;
 if v_new_payment='funded' and v_tx.fulfillment_status='completed' and v_tx.release_eligibility='blocked' then v_new_release:='eligible'; end if;
 if exists(select 1 from public.marketplace_payment_state_sync_events where webhook_event_id=p_webhook_event_id) then
   update public.marketplace_payment_webhook_events set processing_status='processed',processed_at=coalesce(processed_at,now()),error_message=null where id=p_webhook_event_id;
   return jsonb_build_object('processed',true,'duplicate',true);
 end if;
 insert into public.marketplace_payment_state_sync_events(webhook_event_id,transaction_id,normalized_event_type,previous_payment_status,new_payment_status,previous_release_eligibility,new_release_eligibility,applied_amount,currency)
 values(p_webhook_event_id,v_tx.id,case v_type when 'charge.success' then 'payment_succeeded' when 'charge.failed' then 'payment_failed' when 'refund.processed' then 'payment_refunded' end,v_tx.payment_status,v_new_payment,v_tx.release_eligibility,v_new_release,v_amount/100,v_currency);
 update public.marketplace_transactions set payment_status=v_new_payment,release_eligibility=v_new_release,provider_key='paystack',provider_transaction_reference=coalesce(nullif(v_event.payload->'data'->>'reference',''),provider_transaction_reference),updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_payment_webhook_event',p_webhook_event_id,'last_payment_webhook_type',v_type) where id=v_tx.id;
 insert into public.marketplace_transaction_events(transaction_id,event_type,actor_type,actor_id,event_data)
 values(v_tx.id,case v_type when 'charge.success' then 'funded' when 'charge.failed' then 'payment_failed' when 'refund.processed' then 'refunded' end,'payment_provider',null,jsonb_build_object('webhook_event_id',p_webhook_event_id,'provider_key','paystack','provider_event_reference',v_event.provider_event_reference,'amount',v_amount,'currency',v_currency));
 update public.marketplace_payment_webhook_events set processing_status='processed',processed_at=now(),error_message=null where id=p_webhook_event_id;
 update public.marketplace_payment_intents set status=case when v_type='charge.success' then 'succeeded' when v_type='charge.failed' then 'failed' when v_type='refund.processed' then 'refunded' else status end,updated_at=now() where transaction_id=v_tx.id;
 return jsonb_build_object('processed',true,'duplicate',false,'payment_status',v_new_payment,'transaction_id',v_tx.id);
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_profile_sync_proposal(p_proposal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_role public.user_role; v_status text;
begin
 select role,status into v_role,v_status from public.profiles where id=auth.uid();
 if v_status <> 'active' or v_role not in ('staff','admin') then raise exception 'Staff authorization required'; end if;
 select status into v_status from public.profile_sync_proposals where id=p_proposal_id for update;
 if v_status is null then raise exception 'Proposal not found'; end if;
 if v_status <> 'approved' then raise exception 'Proposal must be approved before application'; end if;
 update public.profile_sync_proposals set status='applied', applied_at=now(), updated_at=now(), reviewed_by=coalesce(reviewed_by,auth.uid()) where id=p_proposal_id;
 return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_profile_sync_proposal_v2(p_proposal_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_role public.user_role;
  v_actor_status text;
  v_status text;
  v_client_id uuid;
  v_request_id uuid;
  v_profile_id uuid;
  v_evidence_id uuid;
  v_entity text;
  v_record_id uuid;
  v_field text;
  v_new jsonb;
  v_old jsonb;
  v_history_id uuid;
  v_verified text;
  v_reviewed_by uuid;
  v_applied_value text;
begin
  select role,status into v_role,v_actor_status
  from public.profiles where id=auth.uid();
  if v_actor_status <> 'active' or v_role not in ('staff','admin') then
    raise exception 'Staff authorization required';
  end if;

  select status,client_id,request_id,career_profile_id,evidence_item_id,target_entity,target_record_id,target_field,proposed_value,reviewed_by
    into v_status,v_client_id,v_request_id,v_profile_id,v_evidence_id,v_entity,v_record_id,v_field,v_new,v_reviewed_by
  from public.profile_sync_proposals
  where id=p_proposal_id
  for update;

  if v_status is null then raise exception 'Proposal not found'; end if;
  if v_status <> 'approved' then raise exception 'Proposal must be approved before application'; end if;
  if v_reviewed_by is null then raise exception 'Approved proposal must have a reviewer'; end if;

  if v_evidence_id is not null then
    select verification_status into v_verified from public.evidence_items where id=v_evidence_id;
    if v_verified <> 'verified' then raise exception 'Source evidence must be verified'; end if;
  end if;

  if v_entity='experience' then
    if v_record_id is null then raise exception 'Experience target record is required'; end if;
    if not exists(select 1 from public.experience where id=v_record_id and client_id=v_client_id) then raise exception 'Experience target not found for client'; end if;
    if v_field not in ('organization','job_title','location','employment_type','start_date','end_date','is_current','description','achievements') then raise exception 'Field not permitted for experience'; end if;
    execute format('select to_jsonb(%I) from public.experience where id=$1 and client_id=$2',v_field) into v_old using v_record_id,v_client_id;
    execute format('update public.experience set %I=$1, updated_at=now() where id=$2 and client_id=$3',v_field,
      case v_field
        when 'is_current' then 'boolean'
        when 'achievements' then 'text[]'
        when 'start_date' then 'date'
        when 'end_date' then 'date'
        else 'text'
      end) using case when v_field='is_current' then (v_new #>> '{}')::boolean when v_field='achievements' then array(select jsonb_array_elements_text(v_new)) when v_field in ('start_date','end_date') then (v_new #>> '{}')::date else v_new #>> '{}' end, v_record_id,v_client_id;
  elsif v_entity='education' then
    if v_record_id is null then raise exception 'Education target record is required'; end if;
    if not exists(select 1 from public.education where id=v_record_id and client_id=v_client_id) then raise exception 'Education target not found for client'; end if;
    if v_field not in ('institution','degree','field_of_study','start_date','end_date','description') then raise exception 'Field not permitted for education'; end if;
    execute format('select to_jsonb(%I) from public.education where id=$1 and client_id=$2',v_field) into v_old using v_record_id,v_client_id;
    if v_field in ('start_date','end_date') then
      execute format('update public.education set %I=$1, updated_at=now() where id=$2 and client_id=$3',v_field) using (v_new #>> '{}')::date,v_record_id,v_client_id;
    else
      execute format('update public.education set %I=$1, updated_at=now() where id=$2 and client_id=$3',v_field) using v_new #>> '{}',v_record_id,v_client_id;
    end if;
  elsif v_entity='career_goal' then
    if v_record_id is null then raise exception 'Career goal target record is required'; end if;
    if not exists(select 1 from public.career_goals where id=v_record_id and client_id=v_client_id) then raise exception 'Career goal target not found for client'; end if;
    if v_field not in ('goal','priority','target_date','status') then raise exception 'Field not permitted for career goal'; end if;
    execute format('select to_jsonb(%I) from public.career_goals where id=$1 and client_id=$2',v_field) into v_old using v_record_id,v_client_id;
    if v_field='priority' then
      execute format('update public.career_goals set %I=$1, updated_at=now() where id=$2 and client_id=$3',v_field) using (v_new #>> '{}')::integer,v_record_id,v_client_id;
    elsif v_field='target_date' then
      execute format('update public.career_goals set %I=$1, updated_at=now() where id=$2 and client_id=$3',v_field) using (v_new #>> '{}')::date,v_record_id,v_client_id;
    else
      execute format('update public.career_goals set %I=$1, updated_at=now() where id=$2 and client_id=$3',v_field) using v_new #>> '{}',v_record_id,v_client_id;
    end if;
  elsif v_entity='client_skill' then
    if v_record_id is null then raise exception 'Skill target id is required'; end if;
    if v_field not in ('proficiency','years_experience','evidence','source') then raise exception 'Field not permitted for client skill'; end if;
    if not exists(select 1 from public.skills where id=v_record_id) then raise exception 'Skill target not found'; end if;
    select to_jsonb(cs.proficiency) into v_old from public.client_skills cs where cs.client_id=v_client_id and cs.skill_id=v_record_id;
    if not exists(select 1 from public.client_skills where client_id=v_client_id and skill_id=v_record_id) then
      insert into public.client_skills(client_id,skill_id) values(v_client_id,v_record_id);
    end if;
    if v_field='years_experience' then
      update public.client_skills set years_experience=(v_new #>> '{}')::numeric where client_id=v_client_id and skill_id=v_record_id;
    else
      execute format('update public.client_skills set %I=$1 where client_id=$2 and skill_id=$3',v_field) using v_new #>> '{}',v_client_id,v_record_id;
    end if;
  elsif v_entity='career_profile' then
    if v_profile_id is null then raise exception 'Career profile target is required'; end if;
    if not exists(select 1 from public.career_profiles where id=v_profile_id and client_id=v_client_id) then raise exception 'Career profile target not found for client'; end if;
    if v_field not in ('professional_summary','current_level','target_roles','target_industries','target_locations','career_interests','leadership_experience','development_gaps','career_stage','current_job_title','current_industry','current_location','target_industry','target_role','target_location','interests','achievements','certifications','portfolio_evidence','strengths_summary','development_gaps_summary') then raise exception 'Field not permitted for career profile'; end if;
    execute format('select to_jsonb(%I) from public.career_profiles where id=$1 and client_id=$2',v_field) into v_old using v_profile_id,v_client_id;
    if v_field in ('target_roles','target_industries','target_locations','career_interests','development_gaps') then
      execute format('update public.career_profiles set %I=$1, updated_at=now(), profile_version=profile_version+1 where id=$2 and client_id=$3',v_field) using ARRAY(select jsonb_array_elements_text(v_new)),v_profile_id,v_client_id;
    else
      execute format('update public.career_profiles set %I=$1, updated_at=now(), profile_version=profile_version+1 where id=$2 and client_id=$3',v_field) using v_new #>> '{}',v_profile_id,v_client_id;
    end if;
  else
    raise exception 'Unsupported target entity';
  end if;

  insert into public.profile_change_history(client_id,request_id,career_profile_id,proposal_id,evidence_item_id,target_entity,target_record_id,target_field,old_value,new_value,applied_by,metadata)
  values(v_client_id,v_request_id,v_profile_id,p_proposal_id,v_evidence_id,v_entity,v_record_id,v_field,v_old,v_new,auth.uid(),jsonb_build_object('reviewed_by',v_reviewed_by,'engine_version','07B.21-v1'))
  returning id into v_history_id;

  update public.profile_sync_proposals
  set status='applied', applied_at=now(), updated_at=now()
  where id=p_proposal_id;

  return v_history_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_service_requirements_to_intake(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_session record; v_row record; v_count integer:=0;
begin
 select s.* into v_session from public.dynamic_intake_sessions s where s.id=p_session_id;
 if not found then raise exception 'Session not found'; end if;
 if not exists(select 1 from public.clients c where c.id=v_session.client_id and c.profile_id=(select auth.uid())) and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in('admin','staff','coach')) then raise exception 'Not authorized'; end if;
 for v_row in
   select sr.*,m.profile_field,m.evidence_type,m.document_type,m.question_priority,m.intake_question,m.validation_rule,m.completion_rule,m.human_review_required
   from public.service_requirements sr
   left join public.service_requirement_mappings m on m.requirement_id=sr.id and m.active=true
   where sr.service_id=(select service_id from public.service_requests where id=v_session.service_request_id) and sr.active=true
 loop
   if not exists(select 1 from public.dynamic_intake_requirements r where r.session_id=p_session_id and r.requirement=v_row.requirement_name) then
     insert into public.dynamic_intake_requirements(session_id,client_id,service_request_id,requirement_type,field_name,requirement,rationale,priority,source,source_id)
     values(p_session_id,v_session.client_id,v_session.service_request_id,
       case when v_row.evidence_required then 'evidence' else 'profile_field' end,
       v_row.profile_field,v_row.requirement_name,v_row.description,coalesce(v_row.question_priority,v_row.importance,'medium'),'service_matrix',v_row.id);
     v_count:=v_count+1;
   end if;
 end loop;
 update public.dynamic_intake_sessions set current_step='service_requirements',updated_at=now() where id=p_session_id;
 return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.approve_ai_configuration_version(p_version_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v public.ai_configuration_versions%rowtype;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into v from public.ai_configuration_versions where id=p_version_id for update; if not found then raise exception 'Configuration version not found'; end if;
 if v.status not in ('draft','under_review') then raise exception 'Configuration version cannot be approved'; end if;
 update public.ai_configuration_versions set status='approved',approved_by=u,approved_at=now() where id=v.id;
 insert into public.ai_configuration_change_log(registry_id,version_id,action,previous_version,new_version,actor_id,notes) values(v.registry_id,v.id,'approved',null,v.version,u,p_notes);
 return jsonb_build_object('version_id',v.id,'status','approved','version',v.version);
end; $function$


CREATE OR REPLACE FUNCTION public.approve_ai_human_approval(p_approval_id uuid, p_decision_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  u uuid := auth.uid();
  a public.ai_human_approval_requests%rowtype;
begin
  if u is null then raise exception 'Authentication required'; end if;

  select * into a from public.ai_human_approval_requests where id=p_approval_id for update;
  if not found then raise exception 'Approval request not found'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=u and p.status='active' and p.role in ('admin','staff')
  ) then
    raise exception 'Staff/Admin approval required';
  end if;

  if a.requested_by=u then raise exception 'Independent human approval required'; end if;
  if a.status <> 'pending' then raise exception 'Approval request is not pending'; end if;

  update public.ai_human_approval_requests
  set status='approved', approved_by=u, approved_at=now(), decision_notes=p_decision_notes
  where id=a.id;

  if a.execution_id is not null then
    update public.ai_agent_executions
    set human_review_status='approved', updated_at=now()
    where id=a.execution_id;
  end if;

  insert into public.ai_agent_execution_events(
    request_id,execution_id,event_type,event_data,actor_id
  )
  values(
    a.request_id,a.execution_id,'human_approval',
    jsonb_build_object('approval_id',a.id,'decision','approved','decision_notes',p_decision_notes),
    u
  );

  return jsonb_build_object(
    'approval_id',a.id,'request_id',a.request_id,
    'execution_id',a.execution_id,'status','approved',
    'approved_by',u,'approved_at',now()
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.approve_ai_model_version(p_model_version_id uuid, p_decision_notes text DEFAULT NULL::text)
 RETURNS ai_model_versions
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); r text; v public.ai_model_versions%rowtype;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select role into r from public.profiles where id=u and status='active';
 if r not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into v from public.ai_model_versions where id=p_model_version_id for update;
 if not found then raise exception 'Model version not found'; end if;
 if v.status <> 'testing' then raise exception 'Only testing model versions can be approved'; end if;
 if v.approved_by is not null then raise exception 'Model version already has an approver'; end if;
 update public.ai_model_versions
 set status='approved', approved_by=u, approved_at=now(),
     notes=case when p_decision_notes is null or btrim(p_decision_notes)='' then notes
                else coalesce(notes,'') || case when coalesce(notes,'')='' then '' else E'\n' end || p_decision_notes end,
     updated_at=now()
 where id=v.id
 returning * into v;
 return v;
end; $function$


CREATE OR REPLACE FUNCTION public.approve_ai_prompt_version(p_prompt_version_id uuid, p_decision_notes text DEFAULT NULL::text)
 RETURNS ai_prompt_versions
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); r text; v public.ai_prompt_versions%rowtype;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select role into r from public.profiles where id=u and status='active';
 if r not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into v from public.ai_prompt_versions where id=p_prompt_version_id for update;
 if not found then raise exception 'Prompt version not found'; end if;
 if v.status <> 'testing' then raise exception 'Only testing prompt versions can be approved'; end if;
 if v.created_by is not null and v.created_by=u then raise exception 'Creator cannot approve own prompt version'; end if;
 update public.ai_prompt_versions
 set status='approved', approved_by=u, approved_at=now(),
     change_summary=case when p_decision_notes is null or btrim(p_decision_notes)='' then change_summary
                         else coalesce(change_summary,'') || case when coalesce(change_summary,'')='' then '' else E'\n' end || p_decision_notes end,
     updated_at=now()
 where id=v.id
 returning * into v;
 return v;
end; $function$


CREATE OR REPLACE FUNCTION public.approve_ai_release_candidate(p_release_candidate_id uuid, p_decision_notes text DEFAULT NULL::text)
 RETURNS ai_release_candidates
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_user uuid:=auth.uid(); v_role text; v_status text; v_created_by uuid; v_row public.ai_release_candidates; begin if v_user is null then raise exception 'Authentication required'; end if; select role into v_role from public.profiles where id=v_user and status='active'; if v_role not in ('admin','staff') then raise exception 'Active Admin or Staff approval required'; end if; select status,created_by into v_status,v_created_by from public.ai_release_candidates where id=p_release_candidate_id for update; if not found then raise exception 'Release candidate not found'; end if; if v_status<>'testing' then raise exception 'Release candidate must be in testing status'; end if; if v_created_by=v_user then raise exception 'Release candidate creator cannot approve their own release'; end if; update public.ai_release_candidates set status='approved',approved_by=v_user,approved_at=now(),release_notes=case when p_decision_notes is null then release_notes else release_notes||E'\nRelease approval notes: '||p_decision_notes end,updated_at=now() where id=p_release_candidate_id returning * into v_row; return v_row; end; $function$


CREATE OR REPLACE FUNCTION public.approve_profile_sync_proposal(p_proposal_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.profile_sync_proposals%rowtype; v_user uuid:=auth.uid();
begin
 if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
 if not exists(select 1 from public.profiles where id=v_user and status='active' and role in ('coach','admin','staff')) then raise exception 'Authorized reviewer access required'; end if;
 select * into v from public.profile_sync_proposals where id=p_proposal_id for update;
 if not found then raise exception 'Proposal not found'; end if;
 if v.status<>'pending' then raise exception 'Proposal is no longer pending'; end if;
 if p_decision='approved' and v.evidence_item_id is not null and not exists(select 1 from public.evidence_items where id=v.evidence_item_id and verification_status='verified') then raise exception 'Source evidence is not verified'; end if;
 update public.profile_sync_proposals set status=p_decision,reviewed_by=v_user,reviewed_at=now(),rationale=case when nullif(trim(p_notes),'') is null then rationale else coalesce(rationale,'')||case when coalesce(rationale,'')='' then '' else ' ' end||p_notes end,updated_at=now() where id=p_proposal_id;
 return jsonb_build_object('proposal_id',p_proposal_id,'status',p_decision,'reviewed_by',v_user);
end; $function$


CREATE OR REPLACE FUNCTION public.assert_ai_agent_execution_transition(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
begin
  if p_from=p_to then return false; end if;
  return case p_from
    when 'requested' then p_to in ('authorized','blocked','cancelled')
    when 'authorized' then p_to in ('prepared','blocked','cancelled','failed')
    when 'prepared' then p_to in ('running','blocked','cancelled','failed')
    when 'running' then p_to in ('awaiting_quality','awaiting_human_review','completed','blocked','failed','cancelled')
    when 'awaiting_quality' then p_to in ('awaiting_human_review','completed','blocked','failed','cancelled')
    when 'awaiting_human_review' then p_to in ('running','completed','blocked','failed','cancelled')
    when 'completed' then false
    when 'blocked' then false
    when 'failed' then false
    when 'cancelled' then false
    else false
  end;
end;
$function$


CREATE OR REPLACE FUNCTION public.begin_marketplace_payment_webhook_processing(p_webhook_event_id uuid, p_processing_key text)
 RETURNS TABLE(attempt_id uuid, should_process boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_status text; v_attempt integer; v_attempt_id uuid; begin if (select auth.uid()) is null then raise exception 'not_authenticated'; end if; if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin')) then raise exception 'not_authorized'; end if; if nullif(trim(p_processing_key),'') is null then raise exception 'processing_key_required'; end if; select processing_status into v_status from public.marketplace_payment_webhook_events where id=p_webhook_event_id for update; if not found then raise exception 'webhook_event_not_found'; end if; if v_status in ('processed','ignored') then return query select null::uuid,false; return; end if; if exists(select 1 from public.marketplace_payment_webhook_attempts where processing_key=p_processing_key and status in ('started','succeeded')) then return query select null::uuid,false; return; end if; select coalesce(max(attempt_number),0)+1 into v_attempt from public.marketplace_payment_webhook_attempts where webhook_event_id=p_webhook_event_id; insert into public.marketplace_payment_webhook_attempts(webhook_event_id,attempt_number,processing_key,status) values(p_webhook_event_id,v_attempt,p_processing_key,'started') returning id into v_attempt_id; update public.marketplace_payment_webhook_events set processing_status='verified' where id=p_webhook_event_id and processing_status in ('received','failed'); return query select v_attempt_id,true; end $function$


CREATE OR REPLACE FUNCTION public.bind_ai_agent_configuration(p_agent_key text, p_config_type text, p_config_key text, p_required boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; a public.ai_agent_registry%rowtype; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into a from public.ai_agent_registry where agent_key=p_agent_key and active=true;
 if not found then raise exception 'AI agent not found'; end if;
 if not exists(select 1 from public.ai_configuration_registry where config_type=p_config_type and config_key=p_config_key and active=true) then raise exception 'Active configuration registry entry not found'; end if;
 insert into public.ai_agent_configuration_bindings(agent_id,config_type,config_key,required,active) values(a.id,p_config_type,p_config_key,p_required,true)
 on conflict(agent_id,config_type,config_key) do update set required=excluded.required,active=true returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.bootstrap_initial_platform_admin(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  existing_admin boolean;
  target_email text;
begin
  if auth.uid() is not null then
    raise exception 'This bootstrap function is service-role only';
  end if;

  select exists (select 1 from public.profiles where role = 'admin'::user_role) into existing_admin;
  if existing_admin then
    raise exception 'An administrator already exists';
  end if;

  select email into target_email from auth.users where id = p_user_id;
  if target_email is null then
    raise exception 'Auth user not found';
  end if;
  if lower(target_email) <> lower('tolulope.makinde09@gmail.com') then
    raise exception 'Bootstrap email is not authorized';
  end if;

  insert into public.profiles (id, role, full_name, email, status)
  values (p_user_id, 'admin'::user_role, 'Tolulope Makinde', target_email, 'active')
  on conflict (id) do update
    set role='admin'::user_role, email=excluded.email, status='active', updated_at=now();

  return jsonb_build_object('updated', true, 'user_id', p_user_id, 'role', 'admin');
end;
$function$


CREATE OR REPLACE FUNCTION public.bridge_intake_proposal_to_evidence(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x record; v_evidence uuid; v_status text;
begin
 select * into x from public.dynamic_intake_evidence_proposals where id=p_proposal_id;
 if x.id is null then raise exception 'Evidence proposal not found'; end if;
 if not (exists(select 1 from public.clients c join public.profiles pr on pr.id=c.profile_id where c.id=x.client_id and pr.id=(select auth.uid())) or exists(select 1 from public.profiles pr where pr.id=(select auth.uid()) and pr.role in('admin','staff','coach'))) then raise exception 'Not authorized'; end if;
 if x.evidence_item_id is not null then return jsonb_build_object('evidence_item_id',x.evidence_item_id,'status','already_bridged'); end if;
 v_status:=case when x.verification_status='verified' then 'verified' when x.verification_status='rejected' then 'rejected' else 'unverified' end;
 insert into public.evidence_items(client_id,request_id,claim,evidence_type,source_type,source_id,source_location,confidence,verification_status) values(x.client_id,x.request_id,x.claim,x.evidence_type,x.source_type,x.source_id,x.source_location,x.confidence,v_status) returning id into v_evidence;
 update public.dynamic_intake_evidence_proposals set evidence_item_id=v_evidence,updated_at=now() where id=x.id;
 return jsonb_build_object('evidence_item_id',v_evidence,'status','bridged','verification_status',v_status,'human_review_required',v_status<>'verified');
end; $function$


CREATE OR REPLACE FUNCTION public.cancel_marketplace_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_client uuid; v_coach uuid;
begin
 select client_id,coach_id into v_client,v_coach from marketplace_booking_requests where id=p_booking_id;
 if not (exists(select 1 from clients cl join profiles p on p.id=cl.profile_id where cl.id=v_client and p.id=(select auth.uid())) or exists(select 1 from coaches c join profiles p on p.id=c.profile_id where c.id=v_coach and p.id=(select auth.uid())) or exists(select 1 from profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin'))) then raise exception 'Unauthorized'; end if;
 update marketplace_booking_requests set booking_status='cancelled',coach_notes=case when p_reason is not null then coalesce(coach_notes,'') || case when coach_notes is null or coach_notes='' then '' else E'\n' end || p_reason else coach_notes end,updated_at=now() where id=p_booking_id and booking_status not in ('completed','cancelled');
 update marketplace_booking_slots set status='cancelled',updated_at=now() where booking_id=p_booking_id and status in ('held','booked');
 insert into marketplace_booking_events(booking_id,event_type,actor_type,actor_id,event_data) values(p_booking_id,'cancelled',case when exists(select 1 from profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin')) then 'staff' when exists(select 1 from clients cl join profiles p on p.id=cl.profile_id where cl.id=v_client and p.id=(select auth.uid())) then 'client' else 'coach' end,(select auth.uid()),jsonb_build_object('reason',p_reason));
 return true;
end $function$


CREATE OR REPLACE FUNCTION public.capture_ai_agent_configuration_snapshot(p_execution_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  u uuid := auth.uid();
  role_name text;
  e public.ai_agent_executions%rowtype;
  b record;
  r public.ai_configuration_registry%rowtype;
  v public.ai_configuration_versions%rowtype;
  n integer:=0;
begin
  select role into role_name from public.profiles where id=u and status='active';
  if role_name not in ('admin','staff','coach','client') then
    raise exception 'Authorized CareerDev Global access required';
  end if;

  select * into e from public.ai_agent_executions where id=p_execution_id for update;
  if not found then raise exception 'AI agent execution not found'; end if;
  if role_name in ('coach','client') and e.created_by<>u then
    raise exception 'User may only capture own executions';
  end if;

  for b in
    select * from public.ai_agent_configuration_bindings
    where agent_id=e.agent_id and active=true
    order by config_type,config_key
  loop
    select * into r from public.ai_configuration_registry
    where config_type=b.config_type and config_key=b.config_key and active=true;

    if not found then
      if b.required then raise exception 'Required active configuration missing: % / %',b.config_type,b.config_key; else continue; end if;
    end if;

    select * into v from public.ai_configuration_versions
    where registry_id=r.id and version=r.active_version and status='active';

    if not found then
      if b.required then raise exception 'Required active configuration version missing: % / %',b.config_type,b.config_key; else continue; end if;
    end if;

    insert into public.ai_agent_configuration_snapshots(
      execution_id,agent_id,config_type,config_key,config_version,configuration
    )
    values(e.id,e.agent_id,b.config_type,b.config_key,v.version,v.configuration)
    on conflict(execution_id,config_type,config_key)
    do update set
      config_version=excluded.config_version,
      configuration=excluded.configuration,
      captured_at=now();

    n:=n+1;
  end loop;

  return n;
end;
$function$


CREATE OR REPLACE FUNCTION public.capture_ai_deliverable_version(p_delivery_run_id uuid, p_output jsonb, p_version_type text, p_change_summary text DEFAULT NULL::text, p_step_run_id uuid DEFAULT NULL::uuid, p_review_id uuid DEFAULT NULL::uuid, p_revision_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.ai_service_delivery_runs%rowtype; e public.ai_service_workflow_executions%rowtype; v_user uuid:=auth.uid(); v_role text; v_num integer; v_id uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into r from public.ai_service_delivery_runs where id=p_delivery_run_id for update;
 if not found then raise exception 'Delivery run not found'; end if;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user))) then raise exception 'Authorized reviewer access required'; end if;
 if p_version_type not in ('draft','revision','final','client_revision','coach_revision') then raise exception 'Invalid version type'; end if;
 select coalesce(max(version_number),0)+1 into v_num from public.ai_deliverable_versions where delivery_run_id=r.id;
 if p_step_run_id is not null then select execution_id into e.id from public.ai_service_workflow_step_runs where id=p_step_run_id; end if;
 insert into public.ai_deliverable_versions(delivery_run_id,execution_id,step_run_id,version_number,version_label,version_type,output_snapshot,quality_summary,source_review_id,revision_request_id,change_summary,created_by)
 values(r.id,e.id,p_step_run_id,v_num,'v'||v_num,p_version_type,p_output,coalesce(r.quality_summary,'{}'::jsonb),p_review_id,p_revision_request_id,p_change_summary,v_user) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.capture_ai_execution_configuration(p_execution_type text, p_execution_id uuid, p_config_type text, p_config_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; r public.ai_configuration_registry%rowtype; v public.ai_configuration_versions%rowtype; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff','coach') then raise exception 'Authorized service team access required'; end if;
 select * into r from public.ai_configuration_registry where config_type=p_config_type and config_key=p_config_key and active=true; if not found then raise exception 'Active configuration not found'; end if;
 select * into v from public.ai_configuration_versions where registry_id=r.id and version=r.active_version and status='active'; if not found then raise exception 'Active configuration version not found'; end if;
 insert into public.ai_execution_configuration_snapshots(execution_type,execution_id,config_type,config_key,config_version,configuration) values(p_execution_type,p_execution_id,p_config_type,p_config_key,v.version,v.configuration) on conflict(execution_id,config_type,config_key) do update set config_version=excluded.config_version,configuration=excluded.configuration,captured_at=now() returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.capture_career_profile_version(p_profile_id uuid, p_change_type text DEFAULT 'manual'::text, p_change_summary text DEFAULT NULL::text, p_source_proposal_id uuid DEFAULT NULL::uuid, p_source_evidence_item_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_profile public.career_profiles%rowtype; v_id uuid; v_version integer; v_user uuid:=auth.uid();
begin
 if not exists(select 1 from public.profiles p where p.id=v_user and p.status='active' and p.role in ('coach','staff','admin')) then raise exception 'Authorized staff access required'; end if;
 select * into v_profile from public.career_profiles where id=p_profile_id;
 if not found then raise exception 'Career profile not found'; end if;
 v_version:=coalesce((select max(version) from public.career_profile_versions where career_profile_id=p_profile_id),0)+1;
 insert into public.career_profile_versions(client_id,career_profile_id,version,snapshot,change_summary,change_type,source_proposal_id,source_evidence_item_id,created_by)
 values(v_profile.client_id,p_profile_id,v_version,to_jsonb(v_profile),p_change_summary,p_change_type,p_source_proposal_id,p_source_evidence_item_id,coalesce(p_created_by,v_user)) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.check_coach_marketplace_activation_eligibility(p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_coach public.coaches%rowtype; v_pct integer; v_verified integer; v_services integer; v_availability integer; v_eligible boolean:=true; blockers jsonb:='[]'::jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v_coach from public.coaches where id=p_coach_id;
 if not found then raise exception 'Coach not found'; end if;
 if v_coach.profile_id<>auth.uid() and not exists(select 1 from public.profiles where id=auth.uid() and role in ('staff','admin')) then raise exception 'Not authorized'; end if;
 v_pct:=public.coach_marketplace_profile_completion(p_coach_id);
 if v_pct<100 then blockers:=blockers||jsonb_build_array('profile_incomplete'); v_eligible:=false; end if;
 select count(*) into v_verified from public.coach_verification_records where coach_id=p_coach_id and status in ('verified','approved') and (expires_at is null or expires_at>now());
 if v_verified=0 then blockers:=blockers||jsonb_build_array('verified_credential_required'); v_eligible:=false; end if;
 select count(*) into v_services from public.coach_service_offerings where coach_id=p_coach_id and active=true and price is not null and price>0;
 if v_services=0 then blockers:=blockers||jsonb_build_array('active_service_required'); v_eligible:=false; end if;
 select count(*) into v_availability from public.coach_availability where coach_id=p_coach_id and active=true and end_time>start_time;
 if v_availability=0 then blockers:=blockers||jsonb_build_array('availability_required'); v_eligible:=false; end if;
 insert into public.coach_marketplace_onboarding(coach_id,eligibility_checked_at,eligible_for_activation,activation_blockers)
 values(p_coach_id,now(),v_eligible,blockers)
 on conflict(coach_id) do update set eligibility_checked_at=excluded.eligibility_checked_at,eligible_for_activation=excluded.eligible_for_activation,activation_blockers=excluded.activation_blockers,updated_at=now();
 return jsonb_build_object('coach_id',p_coach_id,'eligible',v_eligible,'profile_completion_pct',v_pct,'verified_credentials',v_verified,'active_services',v_services,'availability_rules',v_availability,'blockers',blockers);
end $function$


CREATE OR REPLACE FUNCTION public.check_marketplace_payout_release(p_payout_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare p public.marketplace_payouts%rowtype; t public.marketplace_transactions%rowtype; rec_status text; refund_total numeric; open_dispute boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists (select 1 from public.profiles where id=auth.uid() and role in ('staff','admin')) then raise exception 'Staff or admin access required'; end if;
 select * into p from public.marketplace_payouts where id=p_payout_id for update;
 if not found then raise exception 'Payout not found'; end if;
 select * into t from public.marketplace_transactions where id=p.transaction_id for update;
 if not found then raise exception 'Transaction not found'; end if;
 select coalesce(sum(amount),0) into refund_total from public.marketplace_refunds where transaction_id=t.id and status in ('requested','under_review','approved','processing','completed','partially_completed');
 select exists(select 1 from public.marketplace_disputes where transaction_id=t.id and status in ('open','under_review','awaiting_response','escalated')) into open_dispute;
 select coalesce(reconciliation_status,'pending') into rec_status from public.marketplace_payment_reconciliation where transaction_id=t.id order by created_at desc limit 1;
 if coalesce(rec_status,'pending') <> 'matched' then update public.marketplace_payouts set release_check_status='blocked',release_check_reason='Payment reconciliation is not matched.',release_checked_at=now(),release_checked_by=auth.uid(),status='on_hold',updated_at=now() where id=p.id; return 'blocked'; end if;
 if open_dispute then update public.marketplace_payouts set release_check_status='blocked',release_check_reason='Open dispute prevents payout release.',release_checked_at=now(),release_checked_by=auth.uid(),status='on_hold',updated_at=now() where id=p.id; return 'blocked'; end if;
 if refund_total > t.gross_amount then update public.marketplace_payouts set release_check_status='blocked',release_check_reason='Refund exposure exceeds transaction amount.',release_checked_at=now(),release_checked_by=auth.uid(),status='on_hold',updated_at=now() where id=p.id; return 'blocked'; end if;
 if p.payout_amount > t.coach_earnings or p.currency <> t.currency then update public.marketplace_payouts set release_check_status='blocked',release_check_reason='Payout amount or currency exceeds coach entitlement.',release_checked_at=now(),release_checked_by=auth.uid(),status='on_hold',updated_at=now() where id=p.id; return 'blocked'; end if;
 if t.release_eligibility not in ('eligible','released') then update public.marketplace_payouts set release_check_status='blocked',release_check_reason='Transaction is not eligible for payout release.',release_checked_at=now(),release_checked_by=auth.uid(),status='on_hold',updated_at=now() where id=p.id; return 'blocked'; end if;
 update public.marketplace_payouts set release_check_status='eligible',release_check_reason='All payout release controls passed.',release_checked_at=now(),release_checked_by=auth.uid(),updated_at=now() where id=p.id;
 return 'eligible';
end;
$function$


CREATE OR REPLACE FUNCTION public.claim_document_processing_job(p_job_id uuid)
 RETURNS document_processing_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_job public.document_processing_jobs;
begin
 update public.document_processing_jobs
 set status='processing', stage='download', attempt_count=attempt_count+1, started_at=coalesce(started_at,now()), updated_at=now()
 where id=p_job_id and status in ('queued','failed')
 returning * into v_job;
 if v_job.id is null then raise exception 'Job unavailable'; end if;
 return v_job;
end; $function$


CREATE OR REPLACE FUNCTION public.claim_document_processing_job_admin(p_job_id uuid)
 RETURNS document_processing_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_job public.document_processing_jobs;
begin
 update public.document_processing_jobs
 set status='processing', stage='download', attempt_count=attempt_count+1, started_at=now(), updated_at=now()
 where id=p_job_id and status in ('queued','failed')
 returning * into v_job;
 if v_job.id is null then raise exception 'Job unavailable'; end if;
 return v_job;
end; $function$


CREATE OR REPLACE FUNCTION public.client_accept_marketplace_service(p_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_client uuid;
BEGIN
  SELECT client_id INTO v_client FROM public.marketplace_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients cl JOIN public.profiles p ON p.id=cl.profile_id
    WHERE cl.id=v_client AND p.id=auth.uid()
  ) THEN RAISE EXCEPTION 'Unauthorized client'; END IF;

  UPDATE public.marketplace_transactions
  SET fulfillment_status='accepted',
      release_eligibility=CASE
        WHEN release_eligibility='disputed' THEN 'disputed'
        WHEN payment_status IN ('funded','held') THEN 'eligible'
        ELSE release_eligibility
      END,
      updated_at=now()
  WHERE id=p_transaction_id AND fulfillment_status='completed';

  IF NOT FOUND THEN RAISE EXCEPTION 'Service is not awaiting acceptance'; END IF;
  INSERT INTO public.marketplace_transaction_events(transaction_id,event_type,actor_type,actor_id)
  VALUES(p_transaction_id,'client_accepted','client',auth.uid());
  RETURN true;
END;
$function$


CREATE OR REPLACE FUNCTION public.coach_confirm_marketplace_booking(p_booking_id uuid, p_coach_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_coach uuid; v_start timestamptz; v_end timestamptz; v_timezone text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coach_id,requested_start,requested_end,timezone into v_coach,v_start,v_end,v_timezone
  from marketplace_booking_requests where id=p_booking_id for update;
  if v_coach is null then raise exception 'Booking not found'; end if;
  if not exists (select 1 from coaches c join profiles p on p.id=c.profile_id where c.id=v_coach and p.id=auth.uid()) then raise exception 'Unauthorized coach'; end if;
  if not exists (select 1 from marketplace_booking_requests where id=p_booking_id and booking_status='requested') then raise exception 'Booking is not awaiting confirmation'; end if;

  insert into marketplace_booking_slots(coach_id,start_at,end_at,timezone,status,booking_id)
  values(v_coach,v_start,v_end,v_timezone,'booked',p_booking_id);

  update marketplace_booking_requests set booking_status='confirmed',coach_notes=coalesce(p_coach_notes,coach_notes),updated_at=now() where id=p_booking_id;
  insert into marketplace_booking_events(booking_id,event_type,actor_type,actor_id,event_data)
  values(p_booking_id,'confirmed','coach',auth.uid(),'{}'::jsonb);
  return true;
exception when exclusion_violation then
  raise exception 'Time slot already unavailable';
end;
$function$


CREATE OR REPLACE FUNCTION public.coach_marketplace_availability_view_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if auth.uid() is null then raise exception 'You must be signed in.'; end if;
 if new.day_of_week < 0 or new.day_of_week > 6 then raise exception 'Invalid day of week.'; end if;
 if new.start_time is null or new.end_time is null or new.start_time >= new.end_time then raise exception 'End time must be later than start time.'; end if;
 if nullif(trim(new.timezone),'') is null then raise exception 'Timezone is required.'; end if;
 if not exists (select 1 from public.coaches c where c.id=new.coach_id and c.profile_id=auth.uid() and c.application_status in ('approved','active')) then raise exception 'You can only manage your own approved coach availability.'; end if;
 insert into public.coach_availability(id,coach_id,day_of_week,start_time,end_time,timezone,active)
 values(coalesce(new.id,gen_random_uuid()),new.coach_id,new.day_of_week,new.start_time,new.end_time,trim(new.timezone),coalesce(new.active,true));
 return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.coach_marketplace_availability_view_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if auth.uid() is null then raise exception 'You must be signed in.'; end if;
 if not exists (select 1 from public.coaches c where c.id=old.coach_id and c.profile_id=auth.uid() and c.application_status in ('approved','active')) then raise exception 'You can only manage your own approved coach availability.'; end if;
 update public.coach_availability set active=new.active where id=old.id and coach_id=old.coach_id;
 if not found then raise exception 'Availability slot not found.'; end if;
 return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.coach_marketplace_profile_completion(p_coach_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare p public.coach_marketplace_profiles%rowtype; score integer:=0;
begin
 select * into p from public.coach_marketplace_profiles where coach_id=p_coach_id;
 if not found then return 0; end if;
 if nullif(trim(coalesce(p.display_name,'')),'') is not null then score:=score+15; end if;
 if nullif(trim(coalesce(p.headline,'')),'') is not null then score:=score+10; end if;
 if nullif(trim(coalesce(p.bio,'')),'') is not null then score:=score+20; end if;
 if coalesce(array_length(p.specializations,1),0)>0 then score:=score+15; end if;
 if coalesce(array_length(p.coaching_formats,1),0)>0 then score:=score+10; end if;
 if coalesce(array_length(p.languages,1),0)>0 then score:=score+5; end if;
 if nullif(trim(coalesce(p.timezone,'')),'') is not null then score:=score+5; end if;
 if nullif(trim(coalesce(p.country,'')),'') is not null then score:=score+5; end if;
 if p.years_coaching is not null and p.years_coaching>=0 then score:=score+5; end if;
 return least(score,100);
end $function$


CREATE OR REPLACE FUNCTION public.coach_semantic_source_text(p_coach_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select trim(concat_ws(E'\n',
    'Professional title: ' || coalesce(c.professional_title, p.headline, ''),
    'Headline: ' || coalesce(p.headline, ''),
    'Bio: ' || coalesce(p.bio, c.professional_bio, ''),
    'Professional bio: ' || coalesce(c.professional_bio, ''),
    'Specializations: ' || coalesce(array_to_string(p.specializations, ', '), ''),
    'Coaching formats: ' || coalesce(array_to_string(p.coaching_formats, ', '), ''),
    'Methodology: ' || coalesce(c.methodology, ''),
    'Languages: ' || coalesce(array_to_string(coalesce(p.languages, c.languages), ', '), ''),
    'Credentials: ' || coalesce(array_to_string(c.credentials, ', '), ''),
    'Experience: ' || coalesce(c.years_experience::text, p.years_coaching::text, ''),
    'Coaching experience: ' || coalesce(c.coaching_experience_years::text, p.years_coaching::text, ''),
    'Timezone: ' || coalesce(p.timezone, c.timezone, ''),
    'Country: ' || coalesce(p.country, '')
  ))
  from public.coach_marketplace_profiles p
  left join public.coaches c on c.id = p.coach_id
  where p.coach_id = p_coach_id;
$function$


CREATE OR REPLACE FUNCTION public.compare_ai_deliverable_versions(p_from_version uuid, p_to_version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare a public.ai_deliverable_versions%rowtype; b public.ai_deliverable_versions%rowtype; v_user uuid:=auth.uid(); v_role text; k text; changed jsonb:='[]'::jsonb; summary text:=''; v_cmp uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into a from public.ai_deliverable_versions where id=p_from_version;
 select * into b from public.ai_deliverable_versions where id=p_to_version;
 if a.id is null or b.id is null or a.delivery_run_id<>b.delivery_run_id then raise exception 'Versions must belong to the same delivery run'; end if;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr join public.ai_service_delivery_runs r on r.service_request_id=sr.id where r.id=a.delivery_run_id and sr.assigned_coach=v_user))) then raise exception 'Authorized reviewer access required'; end if;
 for k in select key from jsonb_object_keys(a.output_snapshot||b.output_snapshot) key loop
   if (a.output_snapshot->k) is distinct from (b.output_snapshot->k) then changed:=changed||jsonb_build_array(jsonb_build_object('field',k,'from',a.output_snapshot->k,'to',b.output_snapshot->k)); end if;
 end loop;
 summary:=format('%s field-level changes detected between %s and %s.',jsonb_array_length(changed),a.version_label,b.version_label);
 insert into public.ai_deliverable_version_comparisons(delivery_run_id,from_version_id,to_version_id,changed_fields,comparison_summary,compared_by) values(a.delivery_run_id,a.id,b.id,changed,summary,v_user) on conflict(from_version_id,to_version_id) do update set changed_fields=excluded.changed_fields,comparison_summary=excluded.comparison_summary,compared_by=excluded.compared_by;
 select id into v_cmp from public.ai_deliverable_version_comparisons where from_version_id=a.id and to_version_id=b.id;
 return jsonb_build_object('comparison_id',v_cmp,'from_version',a.version_label,'to_version',b.version_label,'changed_fields',changed,'summary',summary);
end; $function$


CREATE OR REPLACE FUNCTION public.compare_career_profile_versions(p_profile_id uuid, p_from_version integer, p_to_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare a jsonb; b jsonb; k text; diffs jsonb:='[]'::jsonb; item jsonb;
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role in ('coach','staff','admin')) then raise exception 'Authorized staff access required'; end if;
 select snapshot into a from public.career_profile_versions where career_profile_id=p_profile_id and version=p_from_version;
 select snapshot into b from public.career_profile_versions where career_profile_id=p_profile_id and version=p_to_version;
 if a is null or b is null then raise exception 'Requested profile versions not found'; end if;
 for k in select key from jsonb_object_keys(a) key union select key from jsonb_object_keys(b) key loop
   if (a->k) is distinct from (b->k) then
     item:=jsonb_build_object('field',k,'old_value',a->k,'new_value',b->k);
     diffs:=diffs||jsonb_build_array(item);
   end if;
 end loop;
 return jsonb_build_object('profile_id',p_profile_id,'from_version',p_from_version,'to_version',p_to_version,'difference_count',jsonb_array_length(diffs),'differences',diffs);
end; $function$


CREATE OR REPLACE FUNCTION public.complete_ai_revision_after_quality(p_revision_execution_id uuid, p_quality_results jsonb, p_passed boolean, p_critical_failure boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_workflow_revision_executions%rowtype; q public.ai_workflow_revision_requests%rowtype; u uuid:=auth.uid(); role_name text;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized reviewer access required'; end if;
 select * into x from public.ai_workflow_revision_executions where id=p_revision_execution_id for update;
 if not found then raise exception 'Revision execution not found'; end if;
 select * into q from public.ai_workflow_revision_requests where id=x.revision_request_id;
 if role_name='coach' and not exists(select 1 from public.ai_service_delivery_runs d where d.id=q.delivery_run_id and exists(select 1 from public.service_requests s where s.id=d.service_request_id and s.assigned_coach=u)) then raise exception 'Coach access denied'; end if;
 if p_critical_failure then
   update public.ai_workflow_revision_executions set status='blocked',quality_results=coalesce(p_quality_results,'[]'::jsonb),error_message='Critical quality gate failure',completed_at=now() where id=x.id;
   update public.ai_workflow_revision_requests set status='cancelled' where id=q.id;
   return jsonb_build_object('status','blocked');
 elsif not p_passed then
   update public.ai_workflow_revision_executions set status='awaiting_human_review',quality_results=coalesce(p_quality_results,'[]'::jsonb) where id=x.id;
   update public.ai_workflow_revision_requests set status='open' where id=q.id;
   return jsonb_build_object('status','awaiting_human_review','human_review_required',true);
 end if;
 update public.ai_workflow_revision_executions set status='completed',quality_results=coalesce(p_quality_results,'[]'::jsonb),completed_at=now() where id=x.id;
 update public.ai_workflow_revision_requests set status='completed',revised_output=x.output_snapshot,completed_at=now() where id=q.id;
 update public.ai_service_workflow_step_runs set output_snapshot=x.output_snapshot,status='awaiting_review',updated_at=now() where id=q.step_run_id;
 update public.ai_service_workflow_executions set output_snapshot=x.output_snapshot,status='awaiting_review',updated_at=now() where id=q.execution_id;
 update public.ai_service_delivery_runs set output_snapshot=x.output_snapshot,status='awaiting_human_review',workflow_stage='revised_output_review',human_review_status='pending',updated_at=now() where id=q.delivery_run_id;
 return jsonb_build_object('status','completed','human_review_required',true,'revision_request_id',q.id);
end; $function$


CREATE OR REPLACE FUNCTION public.complete_ai_workflow_step_after_quality(p_step_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_service_workflow_step_runs%rowtype; e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; n public.ai_service_workflow_steps%rowtype; q record; v_user uuid:=auth.uid(); v_role text; v_critical boolean:=false; v_failed boolean:=false; v_next uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into x from public.ai_service_workflow_step_runs where id=p_step_run_id for update;
 if not found then raise exception 'Step run not found'; end if;
 select * into e from public.ai_service_workflow_executions where id=x.execution_id for update;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user))) then raise exception 'Authorized reviewer access required'; end if;
 for q in select * from public.ai_workflow_quality_evaluations where step_run_id=x.id loop
   if not q.passed then v_failed:=true; if q.severity='critical' then v_critical:=true; end if; end if;
 end loop;
 if v_critical then raise exception 'Critical quality gate failed; workflow cannot advance'; end if;
 if v_failed then
   update public.ai_service_workflow_step_runs set status='awaiting_review',updated_at=now() where id=x.id;
   update public.ai_service_workflow_executions set status='awaiting_review',updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='quality_review',updated_at=now() where id=r.id;
   return jsonb_build_object('status','awaiting_review','human_review_required',true);
 end if;
 select * into n from public.ai_service_workflow_steps where workflow_id=e.workflow_id and active=true and step_order>x.step_order order by step_order limit 1;
 if n.id is null then
   update public.ai_service_workflow_step_runs set status='completed',completed_at=now(),updated_at=now() where id=x.id;
   update public.ai_service_workflow_executions set status='completed',completed_at=now(),updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='final_human_review',completed_at=now(),updated_at=now() where id=r.id;
   return jsonb_build_object('status','completed','human_review_required',true);
 end if;
 update public.ai_service_workflow_step_runs set status='completed',completed_at=now(),updated_at=now() where id=x.id;
 insert into public.ai_service_workflow_step_runs(execution_id,step_id,step_order,status,input_snapshot)
 values(e.id,n.id,n.step_order,'pending',jsonb_build_object('previous_output',x.output_snapshot,'execution_context',e.context_snapshot)) on conflict(execution_id,step_id) do nothing returning id into v_next;
 update public.ai_service_workflow_executions set status='running',current_step_order=n.step_order,updated_at=now() where id=e.id;
 update public.ai_service_delivery_runs set status='running',workflow_stage='step_'||n.step_order,updated_at=now() where id=r.id;
 return jsonb_build_object('status','next_step_ready','step_run_id',v_next,'step_order',n.step_order,'step_key',n.step_key);
end; $function$


CREATE OR REPLACE FUNCTION public.complete_marketplace_payment_webhook_processing(p_attempt_id uuid, p_success boolean, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_event uuid; begin if (select auth.uid()) is null then raise exception 'not_authenticated'; end if; if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin')) then raise exception 'not_authorized'; end if; select webhook_event_id into v_event from public.marketplace_payment_webhook_attempts where id=p_attempt_id for update; if not found then raise exception 'attempt_not_found'; end if; update public.marketplace_payment_webhook_attempts set status=case when p_success then 'succeeded' else 'failed' end,error_code=case when p_success then null else p_error_code end,error_message=case when p_success then null else p_error_message end,metadata=coalesce(p_metadata,'{}'::jsonb),finished_at=now() where id=p_attempt_id; update public.marketplace_payment_webhook_events set processing_status=case when p_success then 'processed' else 'failed' end,processed_at=case when p_success then now() else processed_at end,error_message=case when p_success then null else p_error_message end where id=v_event; return true; end $function$


CREATE OR REPLACE FUNCTION public.consume_distributed_rate_limit(p_bucket_key text, p_window_seconds integer DEFAULT 60, p_max_requests integer DEFAULT 12)
 RETURNS TABLE(allowed boolean, retry_after_seconds integer, request_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.ai_distributed_rate_limits%rowtype;
  v_window interval;
begin
  if p_bucket_key is null or length(trim(p_bucket_key)) = 0 or length(p_bucket_key) > 256
     or p_window_seconds not between 1 and 86400
     or p_max_requests not between 1 and 100000 then
    raise exception 'Invalid rate-limit parameters';
  end if;
  v_window := make_interval(secs => p_window_seconds);
  insert into public.ai_distributed_rate_limits(bucket_key, window_started_at, request_count, updated_at)
  values (trim(p_bucket_key), v_now, 1, v_now)
  on conflict (bucket_key) do nothing;
  select * into v_row from public.ai_distributed_rate_limits
  where bucket_key = trim(p_bucket_key) for update;
  if v_now >= v_row.window_started_at + v_window then
    update public.ai_distributed_rate_limits
       set window_started_at = v_now, request_count = 1, updated_at = v_now
     where bucket_key = trim(p_bucket_key);
    return query select true, 0, 1;
    return;
  end if;
  if v_row.request_count >= p_max_requests then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer),
      v_row.request_count;
    return;
  end if;
  update public.ai_distributed_rate_limits as limits
     set request_count = limits.request_count + 1, updated_at = v_now
   where limits.bucket_key = trim(p_bucket_key);
  return query select true, 0, v_row.request_count + 1;
end;
$function$


CREATE OR REPLACE FUNCTION public.consume_shared_ai_quota(p_quota_key text, p_request_units integer DEFAULT 1, p_credit_units integer DEFAULT 0)
 RETURNS TABLE(allowed boolean, reason text, retry_after_seconds integer, request_count integer, request_limit integer, credit_units integer, credit_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_policy public.ai_shared_quota_policies%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := clock_timestamp();
  v_usage public.ai_shared_quota_usage%rowtype;
  v_next_requests integer;
  v_next_credits integer;
begin
  if p_quota_key is null or length(trim(p_quota_key)) = 0 or p_request_units not between 0 and 1000 or p_credit_units not between 0 and 100000 then raise exception 'Invalid shared-quota parameters'; end if;
  select * into v_policy from public.ai_shared_quota_policies where quota_key = trim(p_quota_key) and active = true;
  if not found then return query select false, 'quota_policy_unavailable', 60, 0, 0, 0, 0; return; end if;
  v_start := case v_policy.period_type when 'minute' then date_trunc('minute', v_now) when 'hour' then date_trunc('hour', v_now) when 'day' then date_trunc('day', v_now) else date_trunc('month', v_now) end;
  v_end := case v_policy.period_type when 'minute' then v_start + interval '1 minute' when 'hour' then v_start + interval '1 hour' when 'day' then v_start + interval '1 day' else v_start + interval '1 month' end;
  insert into public.ai_shared_quota_usage(quota_key, period_start, period_end) values (v_policy.quota_key, v_start, v_end) on conflict (quota_key, period_start, period_end) do nothing;
  select * into v_usage from public.ai_shared_quota_usage where quota_key = v_policy.quota_key and period_start = v_start and period_end = v_end for update;
  v_next_requests := v_usage.request_count + p_request_units;
  v_next_credits := v_usage.credit_units + p_credit_units;
  if v_next_requests > v_policy.request_limit then return query select false, 'shared_request_quota_exhausted', greatest(1, ceil(extract(epoch from (v_end - v_now)))::integer), v_usage.request_count, v_policy.request_limit, v_usage.credit_units, v_policy.credit_limit; return; end if;
  if v_next_credits > v_policy.credit_limit then return query select false, 'shared_credit_quota_exhausted', greatest(1, ceil(extract(epoch from (v_end - v_now)))::integer), v_usage.request_count, v_policy.request_limit, v_usage.credit_units, v_policy.credit_limit; return; end if;
  update public.ai_shared_quota_usage set request_count = v_next_requests, credit_units = v_next_credits, updated_at = v_now where quota_key = v_policy.quota_key and period_start = v_start and period_end = v_end;
  return query select true, 'shared_quota_consumed', 0, v_next_requests, v_policy.request_limit, v_next_credits, v_policy.credit_limit;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_ai_agent_execution(p_agent_id uuid, p_workflow_id uuid DEFAULT NULL::uuid, p_trigger_source text DEFAULT 'manual'::text, p_input_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; a public.ai_agent_registry%rowtype; w public.ai_agent_workflows%rowtype; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff','coach') then raise exception 'Authorized service team access required'; end if;
 select * into a from public.ai_agent_registry where id=p_agent_id and active=true; if not found then raise exception 'Active AI agent not found'; end if;
 if p_workflow_id is not null then select * into w from public.ai_agent_workflows where id=p_workflow_id and agent_id=a.id and active=true; if not found then raise exception 'Workflow not found for agent'; end if; end if;
 insert into public.ai_agent_executions(agent_id,workflow_id,status,trigger_source,input_snapshot,human_review_required,human_review_status,created_by) values(a.id,p_workflow_id,'authorized',p_trigger_source,coalesce(p_input_snapshot,'{}'::jsonb),a.human_approval_required,case when a.human_approval_required then 'pending' else 'not_required' end,u) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_ai_configuration_version(p_registry_id uuid, p_configuration jsonb, p_change_summary text DEFAULT NULL::text, p_change_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; r public.ai_configuration_registry%rowtype; v_id uuid; next_version integer;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into r from public.ai_configuration_registry where id=p_registry_id for update; if not found then raise exception 'Configuration registry entry not found'; end if;
 select coalesce(max(version),0)+1 into next_version from public.ai_configuration_versions where registry_id=r.id;
 insert into public.ai_configuration_versions(registry_id,version,configuration,change_summary,change_reason,created_by) values(r.id,next_version,coalesce(p_configuration,'{}'::jsonb),p_change_summary,p_change_reason,u) returning id into v_id;
 insert into public.ai_configuration_change_log(registry_id,version_id,action,new_version,actor_id,notes) values(r.id,v_id,'created',next_version,u,p_change_summary);
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_ai_improvement_experiment(p_proposal_id uuid, p_name text, p_hypothesis text, p_baseline_reference jsonb, p_variant_reference jsonb, p_success_metrics jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; p public.ai_improvement_proposals%rowtype; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into p from public.ai_improvement_proposals where id=p_proposal_id; if not found then raise exception 'Improvement proposal not found'; end if;
 if p.status not in ('approved','under_review') then raise exception 'Proposal must be approved or under review before experiment planning'; end if;
 insert into public.ai_improvement_experiments(proposal_id,name,hypothesis,baseline_reference,variant_reference,success_metrics,created_by) values(p.id,p_name,p_hypothesis,coalesce(p_baseline_reference,'{}'::jsonb),coalesce(p_variant_reference,'{}'::jsonb),coalesce(p_success_metrics,'[]'::jsonb),u) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_ai_improvement_proposal(p_signal_id uuid, p_proposal_type text, p_title text, p_rationale text, p_proposed_change jsonb, p_expected_benefit jsonb DEFAULT '{}'::jsonb, p_risk_assessment jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; s public.ai_improvement_signals%rowtype; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into s from public.ai_improvement_signals where id=p_signal_id; if not found then raise exception 'Improvement signal not found'; end if;
 if p_proposal_type not in ('prompt_change','quality_gate_change','intake_change','service_requirement_change','workflow_change','blueprint_change','data_model_change','process_change','other') then raise exception 'Invalid proposal type'; end if;
 insert into public.ai_improvement_proposals(signal_id,service_id,proposal_type,title,rationale,proposed_change,expected_benefit,risk_assessment,proposed_by) values(s.id,s.service_id,p_proposal_type,p_title,p_rationale,coalesce(p_proposed_change,'{}'::jsonb),coalesce(p_expected_benefit,'{}'::jsonb),coalesce(p_risk_assessment,'{}'::jsonb),u) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_ai_improvement_signal(p_signal_type text, p_signal_summary text, p_service_id uuid DEFAULT NULL::uuid, p_delivery_run_id uuid DEFAULT NULL::uuid, p_source_id uuid DEFAULT NULL::uuid, p_signal_data jsonb DEFAULT '{}'::jsonb, p_severity text DEFAULT 'medium'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 if p_signal_type not in ('quality_failure','revision_pattern','client_feedback','outcome_signal','analytics_insight','workflow_failure','intake_gap','data_quality','human_review') then raise exception 'Invalid signal type'; end if;
 if p_severity not in ('critical','high','medium','low','info') then raise exception 'Invalid severity'; end if;
 insert into public.ai_improvement_signals(signal_type,source_id,service_id,delivery_run_id,signal_summary,signal_data,severity,triaged_by,triaged_at,status) values(p_signal_type,p_source_id,p_service_id,p_delivery_run_id,p_signal_summary,coalesce(p_signal_data,'{}'::jsonb),p_severity,u,now(),'triaged') returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_ai_operational_alert(p_alert_type text, p_severity text, p_title text, p_description text DEFAULT NULL::text, p_agent_id uuid DEFAULT NULL::uuid, p_execution_id uuid DEFAULT NULL::uuid, p_service_id uuid DEFAULT NULL::uuid, p_delivery_run_id uuid DEFAULT NULL::uuid, p_source_event_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; aid uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized operations access required'; end if;
 insert into public.ai_operational_alerts(alert_type,severity,title,description,agent_id,execution_id,service_id,delivery_run_id,source_event_id,metadata,assigned_to)
 values(p_alert_type,p_severity,p_title,p_description,p_agent_id,p_execution_id,p_service_id,p_delivery_run_id,p_source_event_id,coalesce(p_metadata,'{}'::jsonb),null) returning id into aid;
 insert into public.ai_audit_events(event_type,actor_type,actor_id,execution_id,event_data) values('operational_alert_created','user',u,p_execution_id,jsonb_build_object('alert_id',aid,'severity',p_severity,'alert_type',p_alert_type));
 return aid;
end; $function$


CREATE OR REPLACE FUNCTION public.create_ai_service_delivery_run(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 s public.dynamic_intake_sessions%rowtype;
 r public.dynamic_intake_readiness_evaluations%rowtype;
 sr public.service_requests%rowtype;
 bp public.service_intelligence_blueprints%rowtype;
 v_user uuid:=auth.uid();
 v_role text;
 v_run uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into s from public.dynamic_intake_sessions where id=p_session_id for update;
 if not found then raise exception 'Intake session not found'; end if;
 select * into sr from public.service_requests where id=s.service_request_id;
 select * into r from public.dynamic_intake_readiness_evaluations where session_id=p_session_id order by evaluated_at desc limit 1;
 if r.id is null then raise exception 'Readiness evaluation required before AI delivery'; end if;
 if r.readiness_status not in ('ready_for_ai','ready_for_human_review') then raise exception 'Service is not ready for AI delivery'; end if;
 if not (v_role in ('admin','staff') or (v_role='coach' and sr.assigned_coach=v_user) or exists(select 1 from public.clients c join public.profiles p on p.id=v_user where c.id=s.client_id and c.profile_id=p.id)) then raise exception 'Not authorized'; end if;
 select * into bp from public.service_intelligence_blueprints where service_id=sr.service_id and active=true order by blueprint_version desc limit 1;
 if bp.id is null then raise exception 'Active service blueprint not found'; end if;
 insert into public.ai_service_delivery_runs(session_id,client_id,service_request_id,service_id,blueprint_id,readiness_evaluation_id,status,workflow_stage,input_snapshot,created_by)
 values(p_session_id,s.client_id,s.service_request_id,sr.service_id,bp.id,r.id,'authorized','preflight',jsonb_build_object('service_request',to_jsonb(sr),'blueprint',to_jsonb(bp),'readiness',to_jsonb(r),'profile_id',s.career_profile_id),v_user)
 returning id into v_run;
 update public.dynamic_intake_sessions set status='awaiting_review',current_step='ai_delivery_authorized',updated_at=now() where id=p_session_id;
 return jsonb_build_object('run_id',v_run,'status','authorized','human_review_required',true,'service_id',sr.service_id,'blueprint_id',bp.id);
end; $function$


CREATE OR REPLACE FUNCTION public.create_ai_test_control_run(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare u uuid:=auth.uid(); r uuid; c record; begin if not public.is_ai_test_operator_v57() then raise exception 'AI test operator access required'; end if; if not exists(select 1 from public.ai_test_control_groups where id=p_group_id and status='active') then raise exception 'Active test control group not found'; end if; insert into public.ai_test_control_runs(group_id,requested_by) values(p_group_id,u) returning id into r; for c in select test_case_id from public.ai_test_control_group_cases where group_id=p_group_id and active=true order by priority loop insert into public.ai_test_control_results(control_run_id,test_case_id) values(r,c.test_case_id); end loop; return r; end; $function$


CREATE OR REPLACE FUNCTION public.create_careerdev_analytics_alert(p_service_id uuid, p_alert_type text, p_severity text, p_title text, p_description text, p_metric_name text DEFAULT NULL::text, p_metric_value numeric DEFAULT NULL::numeric, p_threshold_value numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 insert into public.careerdev_analytics_alerts(service_id,alert_type,severity,title,description,metric_name,metric_value,threshold_value) values(p_service_id,p_alert_type,p_severity,p_title,p_description,p_metric_name,p_metric_value,p_threshold_value) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_ceo_action_from_insight(p_insight_id uuid, p_title text, p_description text DEFAULT NULL::text, p_priority text DEFAULT 'medium'::text, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid; i public.ceo_operations_insights%rowtype;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select * into i from public.ceo_operations_insights where id=p_insight_id; if not found then raise exception 'Insight not found'; end if;
 if p_priority not in ('urgent','high','medium','low') then raise exception 'Invalid priority'; end if;
 insert into public.ceo_operations_action_items(insight_id,title,description,priority,due_date,created_at,updated_at) values(i.id,p_title,p_description,p_priority,p_due_date,now(),now()) returning id into v_id;
 update public.ceo_operations_insights set status='accepted',reviewed_at=coalesce(reviewed_at,now()) where id=i.id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_client_service_request(p_full_name text, p_service_name text, p_original_request text, p_objective text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_profile_id uuid;
  v_client_id uuid;
  v_service_id uuid;
  v_request_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if v_email is null then
    raise exception 'Authenticated user email is unavailable';
  end if;

  select id into v_profile_id from public.profiles where id = v_user_id;

  if v_profile_id is null then
    insert into public.profiles (id, role, full_name, email, status)
    values (v_user_id, 'client'::public.user_role, nullif(trim(p_full_name), ''), v_email, 'active');
    v_profile_id := v_user_id;
  else
    update public.profiles
      set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
          email = coalesce(email, v_email),
          updated_at = now()
    where id = v_user_id;
  end if;

  select id into v_client_id from public.clients where profile_id = v_profile_id;
  if v_client_id is null then
    insert into public.clients (profile_id, status)
    values (v_profile_id, 'onboarding'::public.client_status)
    returning id into v_client_id;
  end if;

  select id into v_service_id from public.services where active = true and lower(name) = lower(trim(p_service_name)) limit 1;
  if v_service_id is null then
    raise exception 'Service not found: %', p_service_name;
  end if;

  insert into public.service_requests (client_id, service_id, title, original_request, objective, priority, status)
  values (v_client_id, v_service_id, p_service_name, p_original_request, p_objective, 'normal', 'new')
  returning id into v_request_id;

  return v_request_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_coach_earnings_from_transaction(p_transaction_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_tx public.marketplace_transactions%rowtype; v_ledger_id uuid; v_available_at timestamptz;
begin
 select * into v_tx from public.marketplace_transactions where id=p_transaction_id for update;
 if not found then raise exception 'Marketplace transaction not found'; end if;
 if v_tx.payment_status not in ('funded','paid','authorized','held') then raise exception 'Transaction is not funded/held for earnings creation'; end if;
 select id into v_ledger_id from public.coach_earnings_ledger where metadata->>'marketplace_transaction_id'=p_transaction_id::text limit 1;
 if v_ledger_id is not null then return v_ledger_id; end if;
 v_available_at:=case when v_tx.release_eligibility='eligible' then now() else null end;
 insert into public.coach_earnings_ledger(coach_id,order_id,currency,gross_amount,platform_share_pct,platform_amount,coach_share_pct,coach_amount,ledger_status,available_at,metadata)
 values(v_tx.coach_id,null,v_tx.currency,v_tx.gross_amount,v_tx.platform_share_pct,v_tx.platform_fee,v_tx.coach_share_pct,v_tx.coach_earnings,case when v_tx.release_eligibility='eligible' then 'payable' else 'held' end,v_available_at,jsonb_build_object('marketplace_transaction_id',p_transaction_id,'source','marketplace_transaction','created_by','system')) returning id into v_ledger_id;
 return v_ledger_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_coach_payout_request(p_transaction_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_tx public.marketplace_transactions%rowtype; v_ledger public.coach_earnings_ledger%rowtype; v_payout_id uuid; v_caller uuid:=(select auth.uid());
begin
 select * into v_tx from public.marketplace_transactions where id=p_transaction_id;
 if not found then raise exception 'Marketplace transaction not found'; end if;
 select * into v_ledger from public.coach_earnings_ledger where metadata->>'marketplace_transaction_id'=p_transaction_id::text for update;
 if not found then raise exception 'Coach earnings ledger entry does not exist'; end if;
 if not exists(select 1 from public.coaches c join public.profiles p on p.id=c.profile_id where c.id=v_tx.coach_id and p.id=v_caller) then raise exception 'Not authorized to request this coach payout'; end if;
 if v_ledger.ledger_status<>'payable' then raise exception 'Coach earnings are not payable'; end if;
 if v_ledger.available_at is null or v_ledger.available_at>now() then raise exception 'Coach earnings are not yet available'; end if;
 select id into v_payout_id from public.marketplace_payouts where transaction_id=p_transaction_id;
 if v_payout_id is not null then return v_payout_id; end if;
 insert into public.marketplace_payouts(transaction_id,coach_id,currency,gross_coach_earnings,payout_amount,status,metadata) values(p_transaction_id,v_tx.coach_id,v_tx.currency,v_ledger.coach_amount,v_ledger.coach_amount,'pending',jsonb_build_object('source','coach_earnings_ledger','requested_by',v_caller)) returning id into v_payout_id;
 return v_payout_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_cross_border_career_intelligence_request(p_target_country text, p_origin_country text DEFAULT NULL::text, p_target_role text DEFAULT NULL::text, p_present_role text DEFAULT NULL::text, p_relocation_intent text DEFAULT NULL::text, p_work_authorization_context text DEFAULT NULL::text, p_request_details text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_plan text; v_client_id uuid; v_request_id uuid; v_run_id uuid;
begin
 if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
 if nullif(trim(p_target_country),'') is null then raise exception 'TARGET_COUNTRY_REQUIRED'; end if;
 select plan_key into v_plan from private.get_active_entitlement(v_user_id,'cross_border_career_intelligence');
 if v_plan is null then raise exception 'CROSS_BORDER_CAREER_INTELLIGENCE_NOT_INCLUDED'; end if;
 select c.id into v_client_id from public.clients c where c.profile_id=v_user_id limit 1;
 insert into public.cross_border_career_intelligence_requests(user_id,client_id,origin_country,target_country,target_role,present_role,relocation_intent,work_authorization_context,request_details)
 values(v_user_id,v_client_id,nullif(trim(p_origin_country),''),trim(p_target_country),nullif(trim(p_target_role),''),nullif(trim(p_present_role),''),nullif(trim(p_relocation_intent),''),nullif(trim(p_work_authorization_context),''),nullif(trim(p_request_details),'')) returning id into v_request_id;
 if v_client_id is not null then
   insert into public.career_intelligence_runs(client_id,agent_name,agent_version,prompt_version,output_type,output_record_id,status,started_at,created_at)
   values(v_client_id,'cross_border_career_intelligence_agent','1.0','cross-border-v1','cross_border_career_intelligence_request',v_request_id,'queued',now(),now()) returning id into v_run_id;
 end if;
 return jsonb_build_object('allowed',true,'request_id',v_request_id,'run_id',v_run_id,'plan_key',v_plan,'status','queued');
end; $function$


CREATE OR REPLACE FUNCTION public.create_dynamic_intake_session(p_service_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_client uuid;v_profile uuid;v_session uuid; begin select client_id into v_client from public.service_requests where id=p_service_request_id; if v_client is null then raise exception 'Service request not found';end if; if not exists(select 1 from public.clients c where c.id=v_client and c.profile_id=(select auth.uid())) and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in('admin','staff','coach')) then raise exception 'Not authorized';end if; select id into v_profile from public.career_profiles where client_id=v_client and is_current=true limit 1; select id into v_session from public.dynamic_intake_sessions where service_request_id=p_service_request_id and status in('active','awaiting_client','awaiting_review','ready') order by created_at desc limit 1; if v_session is not null then return v_session;end if; insert into public.dynamic_intake_sessions(client_id,service_request_id,career_profile_id,created_by) values(v_client,p_service_request_id,v_profile,(select auth.uid())) returning id into v_session;return v_session;end;$function$


CREATE OR REPLACE FUNCTION public.create_intake_evidence_proposal(p_answer_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e record; q record; r record; v_id uuid; v_target text; v_field text; v_status text; v_conf numeric;
begin
 select ae.*,dq.question_text into e from public.dynamic_intake_answer_events ae join public.dynamic_intake_questions dq on dq.id=ae.question_id where ae.id=p_answer_event_id;
 if e.id is null then raise exception 'Answer event not found'; end if;
 if not (exists(select 1 from public.clients c join public.profiles pr on pr.id=c.profile_id where c.id=e.client_id and pr.id=(select auth.uid())) or exists(select 1 from public.profiles pr where pr.id=(select auth.uid()) and pr.role in('admin','staff','coach'))) then raise exception 'Not authorized'; end if;
 select * into r from public.dynamic_intake_requirements where id=e.requirement_id;
 v_conf:=coalesce(e.confidence,.5);
 v_status:=case when v_conf>=.9 and e.requirement_effect='satisfied' then 'unverified' else 'needs_clarification' end;
 v_target:=case when r.field_name ilike '%skill%' then 'client_skill' when r.field_name ilike '%goal%' or r.field_name ilike '%target%' then 'career_goal' when r.field_name ilike '%education%' then 'education' when r.field_name ilike '%experience%' or r.field_name ilike '%achievement%' then 'experience' else 'career_profile' end;
 v_field:=coalesce(r.field_name,'professional_summary');
 insert into public.dynamic_intake_evidence_proposals(answer_event_id,client_id,request_id,claim,evidence_type,source_type,source_id,source_location,confidence,verification_status,target_entity,target_field,proposed_value,rationale,status) values(e.id,e.client_id,(select service_request_id from public.dynamic_intake_sessions where id=e.session_id),coalesce(e.interpretation,e.answer::text),'client_assertion','intake_answer',e.id,null,v_conf,v_status,v_target,v_field,e.answer,'Client-provided information is treated as a proposal and must be verified before profile synchronization.','proposed') returning id into v_id;
 return jsonb_build_object('proposal_id',v_id,'verification_status',v_status,'target_entity',v_target,'target_field',v_field,'requires_human_review',true);
end; $function$


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


CREATE OR REPLACE FUNCTION public.create_marketplace_event_notification(p_profile_id uuid, p_client_id uuid, p_coach_id uuid, p_booking_id uuid, p_transaction_id uuid, p_notification_type text, p_category text, p_priority text, p_title text, p_body text, p_action_url text DEFAULT NULL::text, p_scheduled_for timestamp with time zone DEFAULT now(), p_metadata jsonb DEFAULT '{}'::jsonb, p_preference_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if p_profile_id is null then raise exception 'notification recipient profile is required'; end if;
  if not public.marketplace_notification_preference_allowed(p_profile_id,p_preference_key,'in_app') then
    return null;
  end if;
  insert into public.marketplace_notifications(profile_id,client_id,coach_id,booking_id,transaction_id,notification_type,category,priority,title,body,action_url,metadata,status,scheduled_for)
  values(p_profile_id,p_client_id,p_coach_id,p_booking_id,p_transaction_id,p_notification_type,p_category,p_priority,p_title,p_body,p_action_url,p_metadata,'queued',coalesce(p_scheduled_for,now()))
  returning id into v_id;
  insert into public.marketplace_notification_deliveries(notification_id,channel,status,attempt_count,metadata)
  values(v_id,'in_app','queued',0,jsonb_build_object('preference_key',p_preference_key));
  insert into public.marketplace_notification_events(notification_id,event_type,actor_type,event_data)
  values(v_id,'queued','system',jsonb_build_object('source','marketplace_event_automation'));
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_marketplace_payment_intent(p_booking_id uuid, p_provider_key text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_tx public.marketplace_transactions%rowtype;
  v_provider public.marketplace_payment_provider_configs%rowtype;
  v_intent uuid;
  v_key text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 then
    raise exception 'valid_idempotency_key_required';
  end if;

  select mt.* into v_tx
  from public.marketplace_transactions mt
  join public.clients c on c.id=mt.client_id
  where mt.booking_id=p_booking_id and c.profile_id=v_uid
  for update;
  if not found then raise exception 'transaction_not_found'; end if;

  if v_tx.payment_status not in ('pending','authorized') then
    raise exception 'payment_not_allowed_for_current_status';
  end if;

  v_key := trim(p_idempotency_key);
  select id into v_intent from public.marketplace_payment_intents where idempotency_key=v_key;
  if v_intent is not null then return v_intent; end if;

  if p_provider_key is null then
    select * into v_provider
    from public.marketplace_payment_provider_configs
    where active=true
      and v_tx.currency = any(supported_currencies)
    order by created_at
    limit 1;
  else
    select * into v_provider
    from public.marketplace_payment_provider_configs
    where active=true and provider_key=trim(p_provider_key)
      and v_tx.currency = any(supported_currencies)
    limit 1;
  end if;

  if v_provider.id is null then raise exception 'no_active_payment_provider_for_currency'; end if;

  insert into public.marketplace_payment_intents(
    transaction_id, provider_key, amount, currency, status, idempotency_key, metadata
  ) values (
    v_tx.id, v_provider.provider_key, v_tx.gross_amount, v_tx.currency,
    'requires_payment', v_key,
    jsonb_build_object('booking_id',v_tx.booking_id,'created_by',v_uid)
  ) returning id into v_intent;

  return v_intent;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_marketplace_transaction(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx uuid;
  v_client uuid;
  v_coach uuid;
  v_service uuid;
  v_amount numeric;
  v_currency text;
  v_platform numeric;
  v_coach_share numeric;
  v_platform_fee numeric;
  v_coach_earnings numeric;
BEGIN
  SELECT b.client_id,b.coach_id,b.service_id,o.price,o.currency
    INTO v_client,v_coach,v_service,v_amount,v_currency
  FROM public.marketplace_booking_requests b
  JOIN public.coach_service_offerings o ON o.id=b.coach_service_offering_id AND o.active=true
  WHERE b.id=p_booking_id AND b.booking_status='confirmed';

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Confirmed booking/service offering not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients cl JOIN public.profiles p ON p.id=cl.profile_id
    WHERE cl.id=v_client AND p.id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_tx FROM public.marketplace_transactions WHERE booking_id=p_booking_id;
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'Transaction already exists for booking';
  END IF;

  SELECT platform_share_pct,coach_share_pct
    INTO v_platform,v_coach_share
  FROM public.platform_revenue_split_config
  WHERE active=true AND effective_from<=now()
    AND (effective_to IS NULL OR effective_to>now())
  ORDER BY effective_from DESC LIMIT 1;

  IF v_platform IS NULL OR v_coach_share IS NULL THEN
    RAISE EXCEPTION 'No active revenue split configuration';
  END IF;
  IF round(v_platform+v_coach_share,2) <> 100 THEN
    RAISE EXCEPTION 'Invalid revenue split configuration';
  END IF;
  IF v_amount IS NULL OR v_amount < 0 OR v_currency IS NULL OR length(trim(v_currency))=0 THEN
    RAISE EXCEPTION 'Invalid service price or currency';
  END IF;

  v_platform_fee=round(v_amount*v_platform/100,2);
  v_coach_earnings=round(v_amount-v_platform_fee,2);

  INSERT INTO public.marketplace_transactions(
    booking_id,client_id,coach_id,service_id,currency,gross_amount,
    platform_share_pct,coach_share_pct,platform_fee,coach_earnings
  ) VALUES (
    p_booking_id,v_client,v_coach,v_service,v_currency,v_amount,
    v_platform,v_coach_share,v_platform_fee,v_coach_earnings
  ) RETURNING id INTO v_tx;

  INSERT INTO public.marketplace_transaction_events(
    transaction_id,event_type,actor_type,actor_id,event_data
  ) VALUES (
    v_tx,'created','client',auth.uid(),
    jsonb_build_object('gross_amount',v_amount,'currency',v_currency,
      'platform_fee',v_platform_fee,'coach_earnings',v_coach_earnings)
  );
  RETURN v_tx;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_profile_rollback_request(p_profile_id uuid, p_target_version integer, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_client uuid; v_id uuid; v_user uuid:=auth.uid();
begin
 if not exists(select 1 from public.profiles p where p.id=v_user and p.status='active' and p.role in ('coach','staff','admin')) then raise exception 'Authorized staff access required'; end if;
 select client_id into v_client from public.career_profiles where id=p_profile_id;
 if v_client is null then raise exception 'Career profile not found'; end if;
 if not exists(select 1 from public.career_profile_versions where career_profile_id=p_profile_id and version=p_target_version) then raise exception 'Target version not found'; end if;
 insert into public.career_profile_rollback_requests(client_id,career_profile_id,target_version,reason,requested_by) values(v_client,p_profile_id,p_target_version,p_reason,v_user) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.create_profile_sync_proposal(p_client_id uuid, p_request_id uuid, p_evidence_item_id uuid, p_evidence_mapping_id uuid, p_target_entity text, p_target_record_id uuid, p_target_field text, p_proposed_value jsonb, p_rationale text, p_confidence numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and status='active' and role in ('coach','admin','staff')) then
    raise exception 'Authorized staff/coach access required';
  end if;
  if p_evidence_item_id is not null and not exists (select 1 from public.evidence_items where id=p_evidence_item_id and client_id=p_client_id and verification_status='verified') then
    raise exception 'Evidence must be verified before profile synchronization';
  end if;
  insert into public.profile_sync_proposals(client_id,request_id,evidence_item_id,evidence_mapping_id,target_entity,target_record_id,target_field,proposed_value,rationale,confidence,source_verification_status,status,proposed_by)
  values(p_client_id,p_request_id,p_evidence_item_id,p_evidence_mapping_id,p_target_entity,p_target_record_id,p_target_field,p_proposed_value,p_rationale,least(greatest(coalesce(p_confidence,.5),0),1),'verified','pending',auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_profile_sync_proposal_from_intake_evidence(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x record; v_sync uuid; v_profile uuid; v_current jsonb; v_value jsonb;
begin
 select dip.*,c.profile_id into x from public.dynamic_intake_evidence_proposals dip join public.clients c on c.id=dip.client_id where dip.id=p_proposal_id;
 if x.id is null then raise exception 'Intake evidence proposal not found'; end if;
 if not (exists(select 1 from public.clients c join public.profiles pr on pr.id=c.profile_id where c.id=x.client_id and pr.id=auth.uid()) or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.role in('admin','staff','coach'))) then raise exception 'Not authorized'; end if;
 if x.status<>'approved' or x.verification_status<>'verified' then raise exception 'Evidence must be approved and verified before profile synchronization'; end if;
 if x.evidence_item_id is null then raise exception 'Evidence item bridge is required'; end if;
 if not exists(select 1 from public.evidence_items e where e.id=x.evidence_item_id and e.verification_status='verified') then raise exception 'Source evidence is not verified'; end if;
 select id into v_profile from public.career_profiles where client_id=x.client_id and is_current=true order by updated_at desc limit 1;
 if v_profile is null then raise exception 'Current career profile not found'; end if;
 v_value:=case when jsonb_typeof(x.proposed_value)='object' and x.proposed_value ? 'value' then x.proposed_value else jsonb_build_object('value',x.proposed_value) end;
 select case x.target_field when 'professional_summary' then to_jsonb(cp.professional_summary) when 'leadership_experience' then to_jsonb(cp.leadership_experience) when 'target_role' then to_jsonb(cp.target_role) when 'target_industry' then to_jsonb(cp.target_industry) when 'target_location' then to_jsonb(cp.target_location) when 'current_job_title' then to_jsonb(cp.current_job_title) when 'current_industry' then to_jsonb(cp.current_industry) when 'current_location' then to_jsonb(cp.current_location) else null end into v_current from public.career_profiles cp where cp.id=v_profile;
 insert into public.profile_sync_proposals(client_id,request_id,career_profile_id,evidence_item_id,target_entity,target_record_id,target_field,current_value,proposed_value,confidence,rationale,source_location,status,proposed_by) values(x.client_id,x.request_id,v_profile,x.evidence_item_id,'career_profile',v_profile,x.target_field,v_current,v_value,x.confidence,x.rationale,x.source_location,'proposed',auth.uid()) returning id into v_sync;
 return jsonb_build_object('profile_sync_proposal_id',v_sync,'career_profile_id',v_profile,'status','proposed','requires_human_review',true);
end; $function$


CREATE OR REPLACE FUNCTION public.create_support_ticket(p_subject text, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=(select auth.uid()); v_tier text:='standard'; v_policy text:='standard'; v_target timestamptz; v_id uuid; v_plan text;
begin
 if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
 if nullif(trim(p_subject),'') is null or nullif(trim(p_description),'') is null then raise exception 'SUBJECT_AND_DESCRIPTION_REQUIRED'; end if;
 select plan_key into v_plan from private.get_active_entitlement(v_user_id,'premium_support');
 if v_plan is not null then v_tier:='premium'; v_policy:='premium';
 else select plan_key into v_plan from private.get_active_entitlement(v_user_id,'priority_support');
   if v_plan is not null then v_tier:='priority'; v_policy:='priority'; end if;
 end if;
 select now()+make_interval(mins=>target_minutes) into v_target from public.support_sla_policies where policy_key=v_policy and active=true;
 insert into public.support_tickets(user_id,subject,description,priority_tier,sla_policy_key,sla_target_at)
 values(v_user_id,trim(p_subject),trim(p_description),v_tier,v_policy,v_target) returning id into v_id;
 return jsonb_build_object('allowed',true,'ticket_id',v_id,'priority_tier',v_tier,'sla_policy_key',v_policy,'sla_target_at',v_target,'plan_key',v_plan);
end; $function$


CREATE OR REPLACE FUNCTION public.ensure_my_client_account()
 RETURNS clients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid(); v_profile public.profiles%rowtype; v_client public.clients%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.profiles where id=v_user_id;
  if not found then raise exception 'Client profile not found. Please complete your account profile first.'; end if;
  if v_profile.role::text <> 'client' then raise exception 'This account is not registered as a client.'; end if;
  if nullif(trim(coalesce(v_profile.full_name,'')),'') is null then raise exception 'Please enter your full name before booking.'; end if;
  select * into v_client from public.clients where profile_id=v_user_id limit 1;
  if found then return v_client; end if;
  insert into public.clients(profile_id,status,onboarding_completed_at) values(v_user_id,'active',now()) returning * into v_client;
  return v_client;
end; $function$


CREATE OR REPLACE FUNCTION public.evaluate_ai_cost_guardrails()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 v_row record;
 v_alerts integer := 0;
 v_status text;
begin
 if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role in ('admin','staff','coach')) then
   raise exception 'Not authorized';
 end if;
 for v_row in select * from public.ai_cost_guardrail_status where guardrail_status in ('warning','critical') loop
   v_status := case when v_row.guardrail_status = 'critical' then 'critical' else 'high' end;
   if not exists (
     select 1 from public.ai_operational_alerts al
     where al.alert_type = 'cost_threshold'
       and al.service_id = v_row.service_id
       and al.status in ('open','acknowledged')
       and al.metadata->>'period_type' = v_row.period_type
   ) then
     insert into public.ai_operational_alerts(alert_type,severity,status,title,description,service_id,metadata)
     values(
       'cost_threshold',
       v_status,
       'open',
       case when v_row.guardrail_status = 'critical' then 'AI service budget critically exceeded' else 'AI service budget warning' end,
       format('%s AI spend for %s is %s%% of the configured %s budget.',v_row.period_type,v_row.service_name,coalesce(v_row.budget_utilization_pct::text,'0'),v_row.period_type),
       v_row.service_id,
       jsonb_build_object('guardrail_id',v_row.guardrail_id,'period_type',v_row.period_type,'budget_usd',v_row.budget_usd,'period_ai_cost_usd',v_row.period_ai_cost_usd,'budget_utilization_pct',v_row.budget_utilization_pct)
     );
     v_alerts := v_alerts + 1;
   end if;
 end loop;
 return jsonb_build_object('evaluated_at',now(),'alerts_created',v_alerts);
end;
$function$


CREATE OR REPLACE FUNCTION public.evaluate_ai_production_safety_gate(p_release_candidate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_rc public.ai_release_candidates%rowtype;
  v_eligible boolean := true;
  v_reasons jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_id uuid;
  v_passed boolean;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role in ('staff','admin')) then
    raise exception 'Staff or admin access required';
  end if;

  select * into v_rc from public.ai_release_candidates where id=p_release_candidate_id;
  if not found then raise exception 'Release candidate not found'; end if;

  -- Required gate 1: candidate must be in testing/approved state.
  v_passed := v_rc.status in ('testing','approved');
  insert into public.ai_safety_gate_checks(release_candidate_id,check_name,check_type,required,passed,rationale)
  values(p_release_candidate_id,'release_candidate_status','approval',true,v_passed,
    case when v_passed then 'Release candidate is in an eligible review state.' else 'Release candidate must be testing or approved before production eligibility can be evaluated.' end)
  on conflict(release_candidate_id,check_name) do update set passed=excluded.passed,rationale=excluded.rationale,evaluated_at=now();
  if not v_passed then v_eligible:=false; v_reasons:=v_reasons || jsonb_build_array('Release candidate is not in testing or approved status.'); v_actions:=v_actions || jsonb_build_array('Move the release candidate into testing and complete evaluation.'); end if;

  -- Required gate 2: prompt must be approved or production.
  v_passed := exists(select 1 from public.ai_prompt_versions p where p.id=v_rc.prompt_version_id and p.status in ('approved','production'));
  insert into public.ai_safety_gate_checks(release_candidate_id,check_name,check_type,required,passed,rationale)
  values(p_release_candidate_id,'prompt_approval','version',true,v_passed,
    case when v_passed then 'Prompt version is approved for controlled release.' else 'Prompt version is not approved for production use.' end)
  on conflict(release_candidate_id,check_name) do update set passed=excluded.passed,rationale=excluded.rationale,evaluated_at=now();
  if not v_passed then v_eligible:=false; v_reasons:=v_reasons || jsonb_build_array('Prompt version is not approved.'); v_actions:=v_actions || jsonb_build_array('Test and approve the prompt version.'); end if;

  -- Required gate 3: model must be approved or production.
  v_passed := exists(select 1 from public.ai_model_versions m where m.id=v_rc.model_version_id and m.status in ('approved','production'));
  insert into public.ai_safety_gate_checks(release_candidate_id,check_name,check_type,required,passed,rationale)
  values(p_release_candidate_id,'model_approval','version',true,v_passed,
    case when v_passed then 'Model version is approved for controlled release.' else 'Model version is not approved for production use.' end)
  on conflict(release_candidate_id,check_name) do update set passed=excluded.passed,rationale=excluded.rationale,evaluated_at=now();
  if not v_passed then v_eligible:=false; v_reasons:=v_reasons || jsonb_build_array('Model version is not approved.'); v_actions:=v_actions || jsonb_build_array('Evaluate and approve the model version.'); end if;

  -- Required gate 4: all recorded quality checks for the candidate must pass.
  v_passed := not exists(
    select 1 from public.ai_safety_gate_checks g
    where g.release_candidate_id=p_release_candidate_id and g.required=true and g.check_name <> 'quality_gates' and g.passed=false
  );
  insert into public.ai_safety_gate_checks(release_candidate_id,check_name,check_type,required,passed,rationale)
  values(p_release_candidate_id,'quality_gates','quality',true,v_passed,
    case when v_passed then 'No recorded required safety gate is failing.' else 'One or more required safety gates are failing.' end)
  on conflict(release_candidate_id,check_name) do update set passed=excluded.passed,rationale=excluded.rationale,evaluated_at=now();
  if not v_passed then v_eligible:=false; v_reasons:=v_reasons || jsonb_build_array('Required quality/safety gates are failing.'); v_actions:=v_actions || jsonb_build_array('Resolve failed quality gates and retest.'); end if;

  insert into public.ai_production_eligibility(release_candidate_id,eligible,decision,blocking_reasons,required_actions,evaluated_by,evaluated_at)
  values(p_release_candidate_id,v_eligible,case when v_eligible then 'eligible' else 'blocked' end,v_reasons,v_actions,auth.uid(),now())
  on conflict(release_candidate_id) do update set eligible=excluded.eligible,decision=excluded.decision,blocking_reasons=excluded.blocking_reasons,required_actions=excluded.required_actions,evaluated_by=excluded.evaluated_by,evaluated_at=now();

  select id into v_id from public.ai_production_eligibility where release_candidate_id=p_release_candidate_id;
  return jsonb_build_object('release_candidate_id',p_release_candidate_id,'eligibility_id',v_id,'eligible',v_eligible,'decision',case when v_eligible then 'eligible' else 'blocked' end,'blocking_reasons',v_reasons,'required_actions',v_actions);
end;
$function$


CREATE OR REPLACE FUNCTION public.evaluate_ai_service_workflow_step(p_step_run_id uuid, p_output jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_service_workflow_step_runs%rowtype; e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; s public.ai_service_workflow_steps%rowtype; g record; v_user uuid:=auth.uid(); v_role text; v_score numeric; v_pass boolean; v_crit_fail integer:=0; v_fail integer:=0; v_results jsonb:='[]'::jsonb; v_has_trace boolean; v_has_review boolean;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into x from public.ai_service_workflow_step_runs where id=p_step_run_id for update;
 if not found then raise exception 'Step run not found'; end if;
 select * into e from public.ai_service_workflow_executions where id=x.execution_id;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 select * into s from public.ai_service_workflow_steps where id=x.step_id;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests q where q.id=r.service_request_id and q.assigned_coach=v_user))) then raise exception 'Authorized coach/staff access required'; end if;
 v_has_trace := coalesce(jsonb_typeof(p_output->'evidence_trace'),'null')='array';
 v_has_review := coalesce((p_output->>'human_review_required')::boolean,true);
 for g in select * from public.ai_quality_gates where active=true and (run_type in ('end_to_end','document_intelligence','intake') or run_type='service_delivery') order by severity desc,name loop
   if g.criterion='no_fabrication' then v_score:=case when coalesce((p_output->>'fabrication_detected')::boolean,false)=false then 1 else 0 end;
   elsif g.criterion='evidence_grounding' then v_score:=case when v_has_trace then 1 else 0 end;
   elsif g.criterion='source_traceability' then v_score:=case when v_has_trace then 1 else 0 end;
   elsif g.criterion='human_review_gate' then v_score:=case when v_has_review then 1 else 0 end;
   elsif g.criterion='service_relevance' then v_score:=case when jsonb_typeof(p_output->'service_relevance')='number' then greatest(0,least(1,(p_output->>'service_relevance')::numeric)) else 0 end;
   else v_score:=case when coalesce((p_output->>'quality_passed')::boolean,false) then 1 else 0 end; end if;
   v_pass:=v_score>=g.threshold;
   insert into public.ai_service_workflow_quality_results(step_run_id,quality_gate_id,score,passed,rationale,evaluator_type) values(x.id,g.id,v_score,v_pass,'Workflow output evaluated against configured quality criterion.','rule') on conflict(step_run_id,quality_gate_id) do update set score=excluded.score,passed=excluded.passed,rationale=excluded.rationale,evaluated_at=now();
   if not v_pass then v_fail:=v_fail+1; if g.severity='critical' then v_crit_fail:=v_crit_fail+1; end if; end if;
   v_results:=v_results||jsonb_build_array(jsonb_build_object('gate',g.name,'criterion',g.criterion,'score',v_score,'passed',v_pass,'severity',g.severity));
 end loop;
 update public.ai_service_workflow_step_runs set quality_results=v_results,output_snapshot=p_output,status=case when v_crit_fail>0 then 'blocked' when v_fail>0 then 'awaiting_review' else status end,updated_at=now(),completed_at=case when v_crit_fail=0 and v_fail=0 then coalesce(completed_at,now()) else completed_at end where id=x.id;
 update public.ai_service_workflow_executions set quality_results=v_results,updated_at=now() where id=e.id;
 if v_crit_fail>0 then update public.ai_service_delivery_runs set status='blocked',workflow_stage='quality_gate_blocked',quality_summary=jsonb_build_object('critical_failures',v_crit_fail,'failures',v_fail,'results',v_results),updated_at=now() where id=r.id; elsif v_fail>0 then update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='quality_gate_review',quality_summary=jsonb_build_object('critical_failures',0,'failures',v_fail,'results',v_results),updated_at=now() where id=r.id; end if;
 return jsonb_build_object('step_run_id',x.id,'critical_failures',v_crit_fail,'failures',v_fail,'passed',v_crit_fail=0 and v_fail=0,'results',v_results);
end; $function$


CREATE OR REPLACE FUNCTION public.evaluate_ai_test_run(p_test_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.ai_test_runs; g record; score numeric; passed boolean; rationale text; total integer:=0; passed_count integer:=0; critical_failed integer:=0; final_status text; result_json jsonb:='[]'::jsonb; evidence_status text; out jsonb;
begin
 select * into r from public.ai_test_runs where id=p_test_run_id; if not found then raise exception 'AI test run not found'; end if;
 out:=coalesce(r.output_snapshot,'{}'::jsonb); evidence_status:=r.input_snapshot->'evidence'->>'verification_status';
 for g in select * from public.ai_quality_gates where active=true and (run_type=r.run_type or run_type='end_to_end') order by severity desc,name loop
  total:=total+1;
  score:=case g.criterion
   when 'evidence_grounding' then case when jsonb_typeof(out->'source_refs')='array' and jsonb_array_length(out->'source_refs')>0 and coalesce((out->>'unsupported_claims')::integer,1)=0 and jsonb_typeof(out->'fact_classifications')='array' and jsonb_array_length(out->'fact_classifications')>0 then 1 else 0 end
   when 'no_fabrication' then case when coalesce((out->>'no_fabrication')::numeric,0)>=1 and coalesce((out->>'unsupported_claims')::integer,1)=0 then 1 else 0 end
   when 'fact_classification' then case when jsonb_typeof(out->'fact_classifications')='array' and jsonb_array_length(out->'fact_classifications')>0 then 1 else 0 end
   when 'source_traceability' then case when jsonb_typeof(out->'source_refs')='array' and jsonb_array_length(out->'source_refs')>0 and coalesce((out->>'source_traceability')::numeric,0)>=1 then 1 else 0 end
   when 'verification_gate' then case when evidence_status='unverified' then case when coalesce((out->>'verification_gate')::boolean,false)=false and coalesce((out->>'unverified_applied')::integer,0)>=1 then 1 else 0 end else case when coalesce((out->>'verification_gate')::boolean,false) then 1 else 0 end end
   when 'mapping_accuracy' then case when out ? 'mapping_accuracy' then least(1,greatest(0,(out->>'mapping_accuracy')::numeric)) else 0 end
   when 'profile_consistency' then case when out ? 'profile_consistency' then least(1,greatest(0,(out->>'profile_consistency')::numeric)) else 0 end
   when 'human_review_gate' then case when coalesce((out->>'human_review_gate')::boolean,false)=true and coalesce((out->>'human_approved')::boolean,false)=false then 1 else 0 end
   when 'service_relevance' then case when out ? 'service_relevance' then least(1,greatest(0,(out->>'service_relevance')::numeric)) else 0 end
   when 'end_to_end_integrity' then case when coalesce((out->>'no_fabrication')::numeric,0)>=1 and coalesce((out->>'unsupported_claims')::integer,1)=0 and coalesce((out->>'source_traceability')::numeric,0)>=1 and coalesce((out->>'human_review_gate')::boolean,false)=true and coalesce((out->>'human_approved')::boolean,false)=false and (evidence_status is distinct from 'unverified' or coalesce((out->>'verification_gate')::boolean,false)=false) then 1 else 0 end
   else 0 end;
  passed:=score>=g.threshold; rationale:=case when passed then 'Quality gate passed.' else 'Quality gate failed: score below configured threshold or required assertion missing.' end;
  insert into public.ai_quality_results(test_run_id,quality_gate_id,score,passed,rationale,evaluator_type) values(p_test_run_id,g.id,score,passed,rationale,'rule');
  result_json:=result_json||jsonb_build_array(jsonb_build_object('gate',g.name,'criterion',g.criterion,'score',score,'threshold',g.threshold,'passed',passed,'severity',g.severity));
  if passed then passed_count:=passed_count+1; elsif g.severity='critical' then critical_failed:=critical_failed+1; end if;
 end loop;
 final_status:=case when critical_failed>0 then 'failed' when total>0 and passed_count=total then 'passed' else 'failed' end;
 update public.ai_test_runs set status=final_status,assertions=result_json,completed_at=now() where id=p_test_run_id;
 return jsonb_build_object('test_run_id',p_test_run_id,'status',final_status,'total_gates',total,'passed_gates',passed_count,'critical_failures',critical_failed,'results',result_json);
end; $function$


CREATE OR REPLACE FUNCTION public.evaluate_ai_workflow_step_quality(p_step_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_service_workflow_step_runs%rowtype; e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; g record; v_user uuid:=auth.uid(); v_role text; v_score numeric; v_pass boolean; v_critical_failed boolean:=false; v_failed boolean:=false; v_results jsonb:='[]'::jsonb; v_summary jsonb; governance jsonb;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into x from public.ai_service_workflow_step_runs where id=p_step_run_id; if not found then raise exception 'Step run not found'; end if;
 select * into e from public.ai_service_workflow_executions where id=x.execution_id; select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user))) then raise exception 'Authorized reviewer access required'; end if;
 if x.output_snapshot is null then raise exception 'Step output is required before quality evaluation'; end if;
 for g in select * from public.ai_quality_gates where active=true and (run_type in ('service_delivery','workflow_step','end_to_end') or run_type='intake') order by severity desc,name loop
   v_score:=1; v_pass:=true;
   if g.criterion='no_fabrication' then if coalesce(x.output_snapshot->>'human_review_required','true')='false' then v_score:=0; v_pass:=false; end if;
   elsif g.criterion in ('evidence_grounding','source_traceability') then if jsonb_typeof(x.output_snapshot->'facts')='array' then select case when count(*)=0 then 1 else avg(case when coalesce(f->>'source_location','')<>'' then 1 else 0 end) end into v_score from jsonb_array_elements(x.output_snapshot->'facts') f; v_pass:=v_score>=g.threshold; else v_score:=0; v_pass:=false; end if;
   elsif g.criterion='service_relevance' then if coalesce(x.output_snapshot->>'service_relevance','')='' then v_score:=0; v_pass:=false; end if;
   elsif g.criterion='human_review_gate' then if coalesce(x.output_snapshot->>'human_review_required','true')<>'true' then v_score:=0; v_pass:=false; end if;
   end if;
   insert into public.ai_workflow_quality_evaluations(step_run_id,execution_id,gate_id,score,passed,severity,rationale,evaluator_type) values(x.id,e.id,g.id,v_score,v_pass,g.severity,case when v_pass then 'Quality criterion satisfied by structured output checks.' else 'Quality criterion failed or required evidence was not present in the structured output.' end,'rule') on conflict(step_run_id,gate_id) do update set score=excluded.score,passed=excluded.passed,severity=excluded.severity,rationale=excluded.rationale,evaluator_type=excluded.evaluator_type;
   v_results:=v_results||jsonb_build_array(jsonb_build_object('gate',g.name,'criterion',g.criterion,'score',v_score,'passed',v_pass,'severity',g.severity));
   if not v_pass then v_failed:=true; if g.severity='critical' then v_critical_failed:=true; end if; end if;
 end loop;
 v_summary:=jsonb_build_object('passed',not v_failed,'critical_failure',v_critical_failed,'results',v_results);
 if v_critical_failed then update public.ai_service_workflow_step_runs set status='blocked',quality_results=v_results,error_message='Critical AI quality gate failure',completed_at=now(),updated_at=now() where id=x.id; update public.ai_service_workflow_executions set status='blocked',quality_results=v_results,error_message='Critical AI quality gate failure',updated_at=now() where id=e.id; update public.ai_service_delivery_runs set status='blocked',workflow_stage='quality_gate_blocked',quality_summary=v_summary,error_message='Critical AI quality gate failure',updated_at=now() where id=r.id;
 elsif v_failed then update public.ai_service_workflow_step_runs set status='awaiting_review',quality_results=v_results,updated_at=now() where id=x.id; update public.ai_service_workflow_executions set status='awaiting_review',quality_results=v_results,updated_at=now() where id=e.id; update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='quality_review',quality_summary=v_summary,updated_at=now() where id=r.id;
 else update public.ai_service_workflow_step_runs set quality_results=v_results,updated_at=now() where id=x.id; update public.ai_service_workflow_executions set quality_results=v_results,updated_at=now() where id=e.id; update public.ai_service_delivery_runs set quality_summary=v_summary,updated_at=now() where id=r.id; end if;
 governance:=public.process_ai_quality_governance(x.id,v_summary); return v_summary||jsonb_build_object('governance',governance);
end; $function$


CREATE OR REPLACE FUNCTION public.evaluate_dynamic_intake_readiness(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); s public.dynamic_intake_sessions%rowtype; sr public.service_requests%rowtype; b public.service_intelligence_blueprints%rowtype; v_total int:=0; v_satisfied int:=0; v_critical int:=0; v_high int:=0; v_conflicts int:=0; v_unverified int:=0; v_missing_docs int:=0; v_score numeric:=0; v_status text:='not_ready'; v_summary jsonb;
begin
 select * into s from public.dynamic_intake_sessions where id=p_session_id; if not found then raise exception 'Intake session not found'; end if;
 select * into sr from public.service_requests where id=s.service_request_id; if not found then raise exception 'Service request not found'; end if;
 if not exists(select 1 from public.clients c join public.profiles p on p.id=c.profile_id where c.id=s.client_id and p.id=v_user) and not exists(select 1 from public.profiles p where p.id=v_user and p.status='active' and p.role in ('admin','staff','coach')) then raise exception 'Unauthorized'; end if;
 select * into b from public.service_intelligence_blueprints where service_id=sr.service_id and active=true order by blueprint_version desc limit 1;
 select count(*) into v_total from public.dynamic_intake_requirements where session_id=s.id and status<>'not_applicable';
 select count(*) into v_satisfied from public.dynamic_intake_requirements where session_id=s.id and status='satisfied';
 select count(*) into v_critical from public.dynamic_intake_requirements where session_id=s.id and status in ('open','needs_review') and priority='critical';
 select count(*) into v_high from public.dynamic_intake_requirements where session_id=s.id and status in ('open','needs_review') and priority='high';
 select count(*) into v_conflicts from public.dynamic_intake_decisions where session_id=s.id and decision='conflict';
 select count(*) into v_unverified from public.dynamic_intake_evidence_proposals where client_id=s.client_id and request_id=s.service_request_id and verification_status<>'verified' and status in ('proposed','needs_clarification');
 select count(*) into v_missing_docs from public.dynamic_intake_requirements where session_id=s.id and requirement_type='document' and status in ('open','needs_review');
 if v_total>0 then v_score:=round(v_satisfied::numeric/v_total::numeric,4); end if;
 if v_critical>0 then v_status:='not_ready'; elsif v_conflicts>0 then v_status:='needs_review'; elsif v_unverified>0 or v_high>0 or v_missing_docs>0 then v_status:='needs_client_input'; elsif v_total=0 then v_status:='not_ready'; else v_status:='ready_for_ai'; end if;
 v_summary:=jsonb_build_object('score',v_score,'blockers',jsonb_build_object('critical_requirements',v_critical,'high_requirements',v_high,'conflicts',v_conflicts,'unverified_evidence',v_unverified,'missing_documents',v_missing_docs),'blueprint_completion_criteria',coalesce(b.completion_criteria,'{}'::jsonb));
 insert into public.dynamic_intake_readiness_evaluations(session_id,client_id,service_request_id,service_id,blueprint_id,readiness_status,readiness_score,critical_open_count,high_open_count,unresolved_conflict_count,unverified_evidence_count,missing_document_count,human_review_required,decision_summary,evaluated_by) values(s.id,s.client_id,s.service_request_id,sr.service_id,b.id,v_status,v_score,v_critical,v_high,v_conflicts,v_unverified,v_missing_docs,true,v_summary,v_user);
 update public.dynamic_intake_sessions set status=case when v_status='ready_for_ai' then 'ready' when v_status in ('needs_client_input','needs_review') then 'awaiting_client' else status end,current_step=case when v_status='ready_for_ai' then 'ready_for_service_delivery' else 'readiness_check' end,completion_score=v_score,updated_at=now() where id=s.id;
 return jsonb_build_object('session_id',s.id,'status',v_status,'readiness_score',v_score,'critical_open',v_critical,'high_open',v_high,'conflicts',v_conflicts,'unverified_evidence',v_unverified,'missing_documents',v_missing_docs,'human_review_required',true);
end; $function$


CREATE OR REPLACE FUNCTION public.evaluate_dynamic_intake_requirement(p_requirement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r record; p record; d text; conf numeric; reason text; action text; src_type text; src_id uuid; result jsonb; caller_role text;
begin
 select r.*,s.client_id,s.service_request_id,s.career_profile_id into r from public.dynamic_intake_requirements r join public.dynamic_intake_sessions s on s.id=r.session_id where r.id=p_requirement_id;
 if r.id is null then raise exception 'Requirement not found'; end if;
 select role into caller_role from public.profiles where id=(select auth.uid());
 if not (r.client_id=(select auth.uid()) or exists(select 1 from public.clients c where c.id=r.client_id and c.profile_id=(select auth.uid())) or caller_role in ('admin','staff','coach')) then raise exception 'Not authorized'; end if;
 d:='missing'; conf:=0; reason:='No verified source currently satisfies this requirement.'; action:='ask_targeted_question'; src_type:=null; src_id:=null;
 if r.requirement_type='profile_field' then
   if r.field_name='target_role' then select * into p from public.career_profiles where id=r.career_profile_id and is_current=true; if p.target_role is not null or coalesce(array_length(p.target_roles,1),0)>0 then d:='satisfied'; conf:=1; reason:='Target role is already present in the current Career Intelligence Profile.'; action:='reuse_profile_data'; src_type:='career_profile'; src_id:=p.id; end if;
   elsif r.field_name='objective' then select * into p from public.service_requests where id=r.service_request_id; if coalesce(length(trim(p.objective)),0)>10 or coalesce(length(trim(p.original_request)),0)>20 then d:='satisfied'; conf:=0.9; reason:='The service request already contains a usable objective or request.'; action:='reuse_service_request'; src_type:='service_request'; src_id:=p.id; end if;
   elsif r.field_name='professional_summary' then select * into p from public.career_profiles where id=r.career_profile_id and is_current=true; if coalesce(length(trim(p.professional_summary)),0)>30 then d:='satisfied'; conf:=0.95; reason:='A professional summary already exists in the current profile.'; action:='reuse_profile_data'; src_type:='career_profile'; src_id:=p.id; end if;
   end if;
 elsif r.requirement_type='evidence' then
   select e.id into src_id from public.evidence_items e where e.client_id=r.client_id and e.verification_status='verified' order by e.created_at desc limit 1;
   if src_id is not null then d:='satisfied'; conf:=0.95; reason:='Verified evidence is available for this intake requirement.'; action:='reuse_verified_evidence'; src_type:='evidence_item'; end if;
 elsif r.requirement_type='document' then
   select doc.id into src_id from public.documents doc where doc.client_id=r.client_id and doc.status in('processed','ready','completed') order by doc.uploaded_at desc limit 1;
   if src_id is not null then d:='satisfied'; conf:=0.9; reason:='A processed client document is already available.'; action:='reuse_document'; src_type:='document'; end if;
 end if;
 insert into public.dynamic_intake_decisions(session_id,requirement_id,decision,source_type,source_id,confidence,reason,recommended_action) values(r.session_id,r.id,d,src_type,src_id,conf,reason,action);
 update public.dynamic_intake_requirements set status=case when d='satisfied' then 'satisfied' else status end,updated_at=now() where id=r.id;
 result:=jsonb_build_object('requirement_id',r.id,'decision',d,'confidence',conf,'reason',reason,'recommended_action',action,'source_type',src_type,'source_id',src_id);
 return result;
end; $function$


CREATE OR REPLACE FUNCTION public.finalize_ai_credit_charge(p_ledger_id uuid, p_outcome text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(status text, credits integer, credits_remaining integer, monthly_allowance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=(select auth.uid());
  v_row public.ai_credit_ledger%rowtype;
  v_allowance integer;
  v_consumed integer;
  v_reserved integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select l.* into v_row from public.ai_credit_ledger l where l.id=p_ledger_id and l.user_id=v_user_id for update;
  if not found then raise exception 'Credit ledger entry not found'; end if;
  if p_outcome not in ('consumed','released') then raise exception 'Outcome must be consumed or released'; end if;
  if v_row.status<>'reserved' then
    select p.monthly_credits into v_allowance from public.ai_agent_subscription_plans p where p.plan_key=v_row.plan_key;
    select coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0),coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0)
      into v_consumed,v_reserved from public.ai_credit_ledger l where l.user_id=v_user_id and l.period_start=v_row.period_start and l.period_end=v_row.period_end;
    return query select v_row.status,v_row.credits,greatest(v_allowance-v_consumed-v_reserved,0),v_allowance; return;
  end if;
  update public.ai_credit_ledger l set status=p_outcome,metadata=coalesce(l.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where l.id=v_row.id;
  select p.monthly_credits into v_allowance from public.ai_agent_subscription_plans p where p.plan_key=v_row.plan_key;
  select coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0),coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0)
    into v_consumed,v_reserved from public.ai_credit_ledger l where l.user_id=v_user_id and l.period_start=v_row.period_start and l.period_end=v_row.period_end;
  return query select p_outcome,v_row.credits,greatest(v_allowance-v_consumed-v_reserved,0),v_allowance;
end;
$function$


CREATE OR REPLACE FUNCTION public.finalize_ai_governed_test_run(p_request_id uuid, p_output_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  u uuid := auth.uid();
  role_name text;
  req public.ai_agent_execution_requests;
  suite_case public.ai_test_suite_cases;
  test_run_id uuid;
  suite_run_id uuid;
  evaluation jsonb;
  test_class text;
  run_type text;
  expected_status text;
  actual_status text;
  status_pass boolean;
begin
  select p.role into role_name
  from public.profiles p
  where p.id=u and p.status='active';

  if role_name not in ('admin','staff') then
    raise exception 'Staff or admin access required';
  end if;

  select * into req
  from public.ai_agent_execution_requests
  where id=p_request_id;

  if not found then
    raise exception 'Execution request not found';
  end if;

  if req.trigger_source<>'test_governed' then
    raise exception 'Only governed test executions may create test runs';
  end if;

  if nullif(req.input_payload->>'test_case','') is null then
    raise exception 'Governed execution is missing test_case';
  end if;

  select * into suite_case
  from public.ai_test_suite_cases
  where id=(req.input_payload->>'test_case')::uuid
    and active=true;

  if not found then
    raise exception 'Active AI test suite case not found';
  end if;

  test_class := coalesce(req.input_payload->>'test_class', req.input_payload->>'validation_category', 'end_to_end');

  run_type := case
    when test_class in ('grounding','normal','negative') then 'document_intelligence'
    when test_class in ('security','evidence_mapping','mapping') then 'evidence_mapping'
    when test_class in ('uncertainty','profile_sync','human_review') then 'profile_sync'
    else 'end_to_end'
  end;

  insert into public.ai_test_runs(
    test_case_id,run_type,status,input_snapshot,output_snapshot,executed_by,started_at
  )
  values(
    null,run_type,'running',
    jsonb_build_object(
      'suite_case_id',suite_case.id,
      'suite_case_name',suite_case.name,
      'validation_category',test_class,
      'case_input',suite_case.input_payload,
      'expected_output',suite_case.expected_output,
      'expected_status',suite_case.expected_status
    ),
    coalesce(p_output_snapshot,'{}'::jsonb),
    u,now()
  )
  returning id into test_run_id;

  evaluation := public.evaluate_ai_test_run(test_run_id);

  expected_status := coalesce(suite_case.expected_status,'passed');
  actual_status := coalesce(
    p_output_snapshot->>'decision_status',
    p_output_snapshot->>'status',
    case when (evaluation->>'status')='passed' then 'passed' else 'failed' end
  );

  status_pass := actual_status=expected_status;

  if not status_pass then
    update public.ai_test_runs
    set status='failed',
        assertions=coalesce(assertions,'[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object(
            'gate','Expected suite status',
            'expected',expected_status,
            'actual',actual_status,
            'passed',false
          )),
        completed_at=now()
    where id=test_run_id;

    evaluation := evaluation ||
      jsonb_build_object(
        'status','failed',
        'expected_suite_status',expected_status,
        'actual_suite_status',actual_status,
        'suite_status_match',false
      );
  else
    evaluation := evaluation ||
      jsonb_build_object(
        'expected_suite_status',expected_status,
        'actual_suite_status',actual_status,
        'suite_status_match',true
      );
  end if;

  insert into public.ai_test_suite_runs(
    suite_case_id,test_run_id,status,actual_output,assertions,executed_by,started_at,completed_at
  )
  values(
    suite_case.id,
    test_run_id,
    case when (evaluation->>'status')='passed' then 'passed' else 'failed' end,
    coalesce(p_output_snapshot,'{}'::jsonb),
    evaluation,
    u,now(),now()
  )
  returning id into suite_run_id;

  return jsonb_build_object(
    'test_run_id',test_run_id,
    'suite_run_id',suite_run_id,
    'suite_case_id',suite_case.id,
    'evaluation',evaluation
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.finalize_ai_service_delivery(p_delivery_run_id uuid, p_version_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.ai_service_delivery_runs%rowtype; v public.ai_deliverable_versions%rowtype; u uuid:=auth.uid(); role_name text; approval_id uuid; delivery_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 select * into r from public.ai_service_delivery_runs where id=p_delivery_run_id for update;
 select * into v from public.ai_deliverable_versions where id=p_version_id;
 if r.id is null or v.id is null or v.delivery_run_id<>r.id then raise exception 'Delivery run or version not found'; end if;
 if not (role_name in ('admin','staff') or (role_name='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=u))) then raise exception 'Authorized reviewer access required'; end if;
 if r.status not in ('awaiting_human_review','completed') then raise exception 'Delivery is not ready for final approval'; end if;
 if r.human_review_status not in ('approved','pending') then raise exception 'Human review state does not permit finalization'; end if;
 if exists(select 1 from public.ai_workflow_quality_evaluations q join public.ai_service_workflow_step_runs s on s.id=q.step_run_id join public.ai_service_workflow_executions e on e.id=s.execution_id where e.delivery_run_id=r.id and q.severity='critical' and q.passed=false) then raise exception 'Critical quality gate failure blocks delivery'; end if;
 select id into approval_id from public.ai_delivery_approvals where delivery_run_id=r.id and decision='approved' order by created_at desc limit 1;
 if approval_id is null then insert into public.ai_delivery_approvals(delivery_run_id,final_version_id,reviewer_id,decision,notes) values(r.id,v.id,u,'approved',p_notes) returning id into approval_id; end if;
 update public.ai_deliverable_versions set version_type='final',change_summary=coalesce(change_summary,'')||case when p_notes is null then '' else ' Final approval: '||p_notes end where id=v.id;
 insert into public.ai_client_deliveries(delivery_run_id,final_version_id,client_id,delivery_status,released_by,released_at) values(r.id,v.id,r.client_id,'released',u,now()) on conflict(delivery_run_id) do update set final_version_id=excluded.final_version_id,delivery_status='released',released_by=excluded.released_by,released_at=excluded.released_at,updated_at=now() returning id into delivery_id;
 update public.ai_service_delivery_runs set status='completed',workflow_stage='client_delivery',human_review_status='approved',quality_summary=coalesce(quality_summary,'{}'::jsonb)||jsonb_build_object('final_approval_id',approval_id,'final_version_id',v.id),updated_at=now() where id=r.id;
 return jsonb_build_object('delivery_run_id',r.id,'approval_id',approval_id,'client_delivery_id',delivery_id,'final_version_id',v.id,'status','released','human_approval_required',false);
end; $function$


CREATE OR REPLACE FUNCTION public.find_public_coach_matches(p_query_embedding vector, p_mode text DEFAULT 'Any format'::text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with eligible as (
    select cmp.coach_id,cmp.display_name,cmp.headline,cmp.bio,cmp.specializations,cmp.coaching_formats,cmp.languages,cmp.timezone,cmp.country,cmp.years_coaching,
      1-(csp.embedding <=> p_query_embedding) semantic_score
    from public.coach_marketplace_profiles cmp
    join public.coach_semantic_profiles csp on csp.coach_id=cmp.coach_id
    join public.coach_marketplace_onboarding cbo on cbo.coach_id=cmp.coach_id
    where cmp.verification_status='approved' and cmp.marketplace_status='active'
      and cbo.onboarding_status in ('approved','active','completed') and cbo.required_agreements_accepted=true and cbo.eligible_for_activation=true
      and exists(select 1 from public.coach_availability ca where ca.coach_id=cmp.coach_id and ca.active=true)
  ), scored as (
    select e.*,
      case when p_mode='Any format' or p_mode=any(e.coaching_formats) then 1 else 0 end mode_fit
    from eligible e
  ), ranked as (
    select *,round((semantic_score*75+mode_fit*25)::numeric,2) combined_score
    from scored
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.combined_score desc),'[]'::jsonb)
  from (
    select coach_id,display_name,headline,bio,specializations,coaching_formats,languages,timezone,country,years_coaching,
      round((semantic_score*100)::numeric,2) semantic_score,combined_score,
      array_remove(array[case when semantic_score>=0.75 then 'Strong goal and expertise alignment' end,case when mode_fit=1 then 'Preferred coaching format matches' end],null) match_reasons,
      array_remove(array[case when mode_fit=0 then 'Preferred coaching format differs' end],null) mismatch_flags
    from ranked order by combined_score desc limit greatest(1,least(p_limit,20))
  ) x;
$function$


CREATE OR REPLACE FUNCTION public.generate_ai_evaluation_report(p_test_run_id uuid, p_generated_by uuid DEFAULT auth.uid())
 RETURNS ai_evaluation_reports
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_run public.ai_test_runs;
  v_total integer := 0;
  v_passed integer := 0;
  v_failed integer := 0;
  v_critical integer := 0;
  v_score numeric(5,4);
  v_status text;
  v_report public.ai_evaluation_reports;
begin
  select * into v_run from public.ai_test_runs where id = p_test_run_id;
  if not found then raise exception 'Test run not found'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('staff','admin') and p.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select count(*), count(*) filter (where passed), count(*) filter (where not passed),
         count(*) filter (where not passed and g.severity = 'critical'),
         coalesce(avg(q.score),0)
    into v_total, v_passed, v_failed, v_critical, v_score
  from public.ai_quality_results q
  join public.ai_quality_gates g on g.id = q.quality_gate_id
  where q.test_run_id = p_test_run_id;

  v_status := case
    when v_run.status = 'blocked' or v_critical > 0 then 'blocked'
    when v_run.status = 'passed' and v_failed = 0 then 'passed'
    when v_run.status = 'running' then 'running'
    else 'failed'
  end;

  insert into public.ai_evaluation_reports (
    test_run_id, run_type, overall_status, overall_score, gates_total, gates_passed,
    gates_failed, critical_failures, failed_gates, recommended_fixes,
    retest_recommended, generated_by
  )
  select
    p_test_run_id,
    v_run.run_type,
    v_status,
    v_score,
    v_total,
    v_passed,
    v_failed,
    v_critical,
    coalesce((select jsonb_agg(jsonb_build_object(
      'gate', g.name,
      'criterion', g.criterion,
      'severity', g.severity,
      'score', q.score,
      'rationale', q.rationale
    ) order by g.severity desc, g.name)
      from public.ai_quality_results q
      join public.ai_quality_gates g on g.id = q.quality_gate_id
      where q.test_run_id = p_test_run_id and not q.passed), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'gate', g.name,
      'action', case
        when g.criterion = 'no_fabrication' then 'Remove or verify unsupported claims before release.'
        when g.criterion = 'verification_gate' then 'Require evidence verification before applying mappings.'
        when g.criterion = 'human_review_gate' then 'Obtain human approval before authoritative profile changes.'
        when g.criterion = 'source_traceability' then 'Attach source provenance to every consequential claim.'
        when g.criterion = 'fact_classification' then 'Correct FACT/INFERENCE/UNVERIFIED/CONFLICTING classifications.'
        when g.criterion = 'mapping_accuracy' then 'Review and correct evidence-to-profile mappings.'
        when g.criterion = 'profile_consistency' then 'Reconcile generated profile changes with verified source data.'
        else 'Review the failed gate and rerun the relevant test.'
      end
    ) order by g.severity desc, g.name)
      from public.ai_quality_results q
      join public.ai_quality_gates g on g.id = q.quality_gate_id
      where q.test_run_id = p_test_run_id and not q.passed), '[]'::jsonb),
    (v_status in ('failed','blocked')),
    coalesce(p_generated_by, auth.uid())
  returning * into v_report;

  return v_report;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_ai_service_pricing_recommendations()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_count integer:=0; r record; v_id uuid; begin if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role in ('admin','staff','coach')) then raise exception 'Not authorized'; end if; for r in select * from public.ai_service_profitability_intelligence loop if not exists(select 1 from public.ai_service_pricing_recommendations x where x.service_id=r.service_id and x.created_at>=now()-interval '24 hours') then insert into public.ai_service_pricing_recommendations(service_id,economics_config_id,current_price,currency,ai_cost_usd,human_delivery_cost,comparable_cost_total,target_margin_pct,recommended_price,recommendation_type,rationale,assumptions,status,created_by) values(r.service_id,r.economics_config_id,r.current_price,r.service_currency,r.ai_cost_usd,r.human_delivery_cost,r.estimated_total_delivery_cost,r.target_margin_pct,r.target_margin_price,r.recommendation_type,case when r.recommendation_type='increase_price' then 'Configured price is below the price required for the configured target margin.' when r.recommendation_type='cost_optimization' then 'Configured economics indicate room to optimize delivery cost while retaining the current price.' when r.recommendation_type='maintain_price' then 'Configured price is broadly consistent with the configured target margin.' else 'Additional verified service economics inputs are required.' end,jsonb_build_object('source','configured_service_economics_and_actual_ai_usage','revenue_verification_required',true,'fx_required_if_non_usd',upper(coalesce(r.service_currency,''))<>'USD'),'draft',auth.uid()) returning id into v_id; v_count:=v_count+1; end if; end loop; return v_count; end; $function$


CREATE OR REPLACE FUNCTION public.generate_ceo_operations_insight(p_service_id uuid DEFAULT NULL::uuid, p_period_start date DEFAULT NULL::date, p_period_end date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid; start_d date:=coalesce(p_period_start,current_date-30); end_d date:=coalesce(p_period_end,current_date); reqs numeric:=0; deliveries numeric:=0; revisions numeric:=0; outcomes numeric:=0; achieved numeric:=0; qfails numeric:=0; revision_rate numeric; achievement_rate numeric;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 select count(*) into reqs from public.service_requests sr where (p_service_id is null or sr.service_id=p_service_id) and sr.created_at::date between start_d and end_d;
 select count(*) into deliveries from public.ai_service_delivery_runs r where (p_service_id is null or r.service_id=p_service_id) and r.status='completed' and r.created_at::date between start_d and end_d;
 select count(*) into revisions from public.ai_workflow_revision_requests q join public.ai_service_delivery_runs r on r.id=q.delivery_run_id where (p_service_id is null or r.service_id=p_service_id) and q.created_at::date between start_d and end_d;
 select count(*) into outcomes from public.client_service_outcomes o left join public.service_requests sr on sr.id=o.service_request_id where (p_service_id is null or sr.service_id=p_service_id) and o.created_at::date between start_d and end_d;
 select count(*) into achieved from public.client_service_outcomes o left join public.service_requests sr on sr.id=o.service_request_id where (p_service_id is null or sr.service_id=p_service_id) and o.status='achieved' and o.created_at::date between start_d and end_d;
 select count(*) into qfails from public.ai_workflow_quality_evaluations q join public.ai_service_workflow_step_runs s on s.id=q.step_run_id join public.ai_service_workflow_executions e on e.id=s.execution_id join public.ai_service_delivery_runs r on r.id=e.delivery_run_id where (p_service_id is null or r.service_id=p_service_id) and q.passed=false and q.severity in ('critical','high') and q.created_at::date between start_d and end_d;
 revision_rate:=case when deliveries=0 then 0 else revisions/deliveries end; achievement_rate:=case when outcomes=0 then 0 else achieved/outcomes end;
 insert into public.ceo_operations_insights(insight_type,severity,title,insight,supporting_data,recommended_action,action_priority,service_id,status,owner_id)
 values(case when qfails>0 then 'quality' when revision_rate>.5 then 'efficiency' when achievement_rate>.5 then 'outcome' else 'performance' end,
 case when qfails>=5 then 'critical' when revision_rate>.75 then 'high' when revision_rate>.5 then 'medium' else 'info' end,
 'CareerDev service performance insight',
 format('During %s to %s, there were %s requests, %s completed deliveries, %s revisions, %s outcomes, %s achieved outcomes, and %s critical/high quality failures.',start_d,end_d,reqs,deliveries,revisions,outcomes,achieved,qfails),
 jsonb_build_object('period_start',start_d,'period_end',end_d,'requests',reqs,'deliveries',deliveries,'revisions',revisions,'revision_rate',revision_rate,'outcomes',outcomes,'achieved',achieved,'achievement_rate',achievement_rate,'quality_failures',qfails),
 case when qfails>0 then 'Review failed quality gates and affected workflows.' when revision_rate>.5 then 'Review service requirements, intake quality and workflow prompts.' when outcomes>0 and achievement_rate<.25 then 'Review service effectiveness and client outcome barriers.' else 'Continue monitoring performance and collect more outcome data.' end,
 case when qfails>0 then 'high' when revision_rate>.5 then 'medium' else 'low' end,p_service_id,'new',u) returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.generate_coach_match_candidates(p_service_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_client_id uuid; v_count integer:=0; begin select client_id into v_client_id from public.service_requests where id=p_service_request_id; if v_client_id is null then raise exception 'Service request not found'; end if; if not exists(select 1 from public.profiles p join public.clients c on c.profile_id=p.id where c.id=v_client_id and p.id=(select auth.uid())) and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin')) then raise exception 'Not authorized'; end if; insert into public.coach_match_results(client_id,service_request_id,coach_id) select v_client_id,p_service_request_id,c.id from public.coaches c join public.coach_marketplace_profiles cmp on cmp.coach_id=c.id where c.application_status='active' and cmp.verification_status='verified' and cmp.marketplace_status='active' on conflict(service_request_id,coach_id) do nothing; get diagnostics v_count=row_count; return jsonb_build_object('service_request_id',p_service_request_id,'candidates_added',v_count); end; $function$


CREATE OR REPLACE FUNCTION public.generate_coach_match_candidates(p_service_request_id uuid, p_query_embedding vector, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  with request_owner as (select id, client_id from public.service_requests where id=p_service_request_id and client_id=auth.uid()),
  eligible as (
    select cmp.coach_id,cmp.display_name,cmp.headline,cmp.bio,cmp.specializations,cmp.coaching_formats,cmp.languages,cmp.timezone,cmp.country,cmp.years_coaching,
      case when p_query_embedding is null or csp.embedding is null then null else 1-(csp.embedding <=> p_query_embedding) end semantic_similarity
    from public.coach_marketplace_profiles cmp
    join public.coach_semantic_profiles csp on csp.coach_id=cmp.coach_id
    join public.coach_marketplace_onboarding cbo on cbo.coach_id=cmp.coach_id
    where cmp.verification_status='approved' and cmp.marketplace_status='active'
      and cbo.onboarding_status in ('approved','active','completed') and cbo.required_agreements_accepted=true and cbo.eligible_for_activation=true
      and exists(select 1 from public.coach_availability ca where ca.coach_id=cmp.coach_id and ca.active=true)
  ),
  scored as (
    select e.*,coalesce(e.semantic_similarity,0) semantic_score,
      case when exists(select 1 from public.coach_matching_preferences p where p.service_request_id=p_service_request_id and coalesce(p.preferred_coaching_formats,'{}') && coalesce(e.coaching_formats,'{}')) then 1 else 0 end format_fit,
      case when exists(select 1 from public.coach_matching_preferences p where p.service_request_id=p_service_request_id and (coalesce(p.preferred_countries,'{}')='{}' or e.country=any(p.preferred_countries))) then 1 else 0 end country_fit,
      case when exists(select 1 from public.coach_matching_preferences p where p.service_request_id=p_service_request_id and (coalesce(p.preferred_timezones,'{}')='{}' or e.timezone=any(p.preferred_timezones))) then 1 else 0 end timezone_fit
    from eligible e where exists(select 1 from request_owner)
  ), ranked as (
    select *,round((semantic_score*45+((format_fit+country_fit+timezone_fit)/3.0)*25+30)::numeric,2) combined_score from scored
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.combined_score desc),'[]'::jsonb)
  from (select coach_id,display_name,headline,bio,specializations,coaching_formats,languages,timezone,country,years_coaching,round((semantic_score*100)::numeric,2) semantic_score,combined_score,
    array_remove(array[case when semantic_score>=0.75 then 'Strong goal and expertise alignment' end,case when format_fit=1 then 'Preferred coaching format matches' end,case when country_fit=1 then 'Location constraint matches' end,case when timezone_fit=1 then 'Timezone constraint matches' end],null) match_reasons,
    array_remove(array[case when format_fit=0 then 'No preferred-format match' end,case when country_fit=0 then 'No preferred-country match' end,case when timezone_fit=0 then 'No preferred-timezone match' end],null) mismatch_flags
  from ranked order by combined_score desc limit greatest(1,least(p_limit,50))) x;
$function$


CREATE OR REPLACE FUNCTION public.generate_dynamic_intake_requirements(p_session_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_session record;v_req public.service_requests%rowtype;v_profile public.career_profiles%rowtype;v_count integer:=0; begin select s.* into v_session from public.dynamic_intake_sessions s where s.id=p_session_id;if not found then raise exception 'Session not found';end if;if not exists(select 1 from public.clients c where c.id=v_session.client_id and c.profile_id=(select auth.uid())) and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in('admin','staff','coach')) then raise exception 'Not authorized';end if;select * into v_req from public.service_requests where id=v_session.service_request_id;select * into v_profile from public.career_profiles where id=v_session.career_profile_id;if nullif(trim(coalesce(v_req.objective,'')),'') is null then insert into public.dynamic_intake_requirements(session_id,client_id,service_request_id,requirement_type,field_name,requirement,rationale,priority,source) values(p_session_id,v_session.client_id,v_req.id,'goal','objective','A clear service objective is required.','The service must have a measurable intended outcome.','high','service_request');v_count:=v_count+1;end if;if nullif(trim(coalesce(v_req.target_role,'')),'') is null and nullif(trim(coalesce(v_profile.target_role,'')),'') is null and coalesce(array_length(v_profile.target_roles,1),0)=0 then insert into public.dynamic_intake_requirements(session_id,client_id,service_request_id,requirement_type,field_name,requirement,rationale,priority,source) values(p_session_id,v_session.client_id,v_req.id,'goal','target_role','Target career role must be defined.','Target-role information determines positioning, evidence, keywords, and service recommendations.','critical','service_request');v_count:=v_count+1;end if;if nullif(trim(coalesce(v_req.target_country,'')),'') is null and nullif(trim(coalesce(v_profile.target_location,'')),'') is null and coalesce(array_length(v_profile.target_locations,1),0)=0 then insert into public.dynamic_intake_requirements(session_id,client_id,service_request_id,requirement_type,field_name,requirement,priority,source) values(p_session_id,v_session.client_id,v_req.id,'preference','target_location','Preferred target country or location is needed.','Geography can materially affect career strategy and opportunity matching.','medium','service_request');v_count:=v_count+1;end if;if nullif(trim(coalesce(v_profile.professional_summary,'')),'') is null then insert into public.dynamic_intake_requirements(session_id,client_id,service_request_id,requirement_type,field_name,requirement,rationale,priority,source) values(p_session_id,v_session.client_id,v_req.id,'profile_field','professional_summary','Professional background summary is missing.','A reliable profile summary supports downstream service delivery.','high','system');v_count:=v_count+1;end if;if not exists(select 1 from public.evidence_items e where e.client_id=v_session.client_id and e.verification_status='verified') then insert into public.dynamic_intake_requirements(session_id,client_id,service_request_id,requirement_type,requirement,rationale,priority,source) values(p_session_id,v_session.client_id,v_req.id,'evidence','At least one verified evidence source should support the profile.','Career deliverables should be grounded in verifiable client evidence.','high','system');v_count:=v_count+1;end if;update public.dynamic_intake_sessions set updated_at=now(),current_step='requirements' where id=p_session_id;return v_count;end;$function$


CREATE OR REPLACE FUNCTION public.generate_next_dynamic_intake_question(p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_req record;v_q uuid;v_seq integer; begin if not exists(select 1 from public.dynamic_intake_sessions s join public.clients c on c.id=s.client_id where s.id=p_session_id and (c.profile_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in('admin','staff','coach')))) then raise exception 'Not authorized';end if;select coalesce(max(sequence_no),0)+1 into v_seq from public.dynamic_intake_questions where session_id=p_session_id;select r.* into v_req from public.dynamic_intake_requirements r where r.session_id=p_session_id and r.status='open' order by case r.priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,r.created_at limit 1;if not found then update public.dynamic_intake_sessions set status='ready',current_step='complete',completion_score=1,updated_at=now() where id=p_session_id;return null;end if;insert into public.dynamic_intake_questions(session_id,requirement_id,client_id,sequence_no,question_text,question_type,required,rationale) values(p_session_id,v_req.id,v_req.client_id,v_seq,case v_req.field_name when 'target_role' then 'What specific career role or roles are you targeting?' when 'target_location' then 'Which country, city, or geographic market are you targeting?' when 'professional_summary' then 'Please briefly describe your professional background, strongest experience, and the direction you want to pursue.' when 'objective' then 'What specific outcome do you want to achieve through this service?' else 'Please provide the information needed to complete your Career Intelligence Profile.' end,case when v_req.requirement_type='evidence' then 'file' else 'textarea' end,true,v_req.rationale) returning id into v_q;update public.dynamic_intake_sessions set last_question_id=v_q,status='awaiting_client',current_step='questioning',updated_at=now() where id=p_session_id;return v_q;end;$function$


CREATE OR REPLACE FUNCTION public.generate_profile_enrichment_requests(p_client_id uuid, p_profile_id uuid, p_quality_run_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_issue record;
  v_count integer:=0;
  v_existing boolean;
  v_req_id uuid;
  v_role text;
begin
  if not exists (select 1 from public.clients c where c.id=p_client_id and c.profile_id=(select auth.uid()))
     and not exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('admin','staff','coach')) then
    raise exception 'Not authorized';
  end if;

  for v_issue in
    select qi.* from public.career_profile_quality_issues qi
    where qi.client_id=p_client_id and qi.career_profile_id=p_profile_id
      and qi.resolution_status in ('open','needs_review')
      and (p_quality_run_id is null or qi.run_id=p_quality_run_id)
    order by case qi.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end
  loop
    select exists(select 1 from public.career_profile_enrichment_requests er where er.quality_issue_id=v_issue.id and er.status not in ('resolved','dismissed')) into v_existing;
    if not v_existing then
      v_role:=coalesce(v_issue.field_name,'career profile');
      insert into public.career_profile_enrichment_requests(
        client_id,career_profile_id,quality_issue_id,request_type,priority,field_name,
        gap_description,rationale,requested_information,suggested_question,requested_evidence_type,created_by
      ) values (
        p_client_id,p_profile_id,v_issue.id,
        case when v_issue.issue_type in ('conflict','evidence_mismatch','unsupported_claim') then 'verification' else 'question' end,
        case when v_issue.severity='critical' then 'critical' when v_issue.severity='high' then 'high' else 'medium' end,
        v_issue.field_name,
        v_issue.description,
        'Resolve this profile quality issue before relying on the affected information for downstream career services.',
        case when v_issue.issue_type='missing_information' then 'Provide the missing career information.' else 'Clarify or verify the information described in the issue.' end,
        case when v_issue.issue_type='missing_information' then 'Please provide the information needed to complete your Career Intelligence Profile.' else 'Please clarify or provide evidence supporting the information currently associated with your career profile.' end,
        case when v_issue.issue_type in ('conflict','evidence_mismatch','unsupported_claim') then 'supporting document or source evidence' else null end,
        (select auth.uid())
      ) returning id into v_req_id;

      insert into public.career_profile_gap_questions(enrichment_request_id,client_id,question_text,question_type,required)
      values(v_req_id,p_client_id,
        case when v_issue.issue_type='missing_information' then 'Please provide the missing information for your career profile.'
             when v_issue.issue_type='conflict' then 'Which version of this information is correct, and can you provide supporting evidence?'
             when v_issue.issue_type='evidence_mismatch' then 'Can you provide evidence supporting this profile information?'
             else 'Please clarify this information and provide supporting evidence where applicable.' end,
        'textarea',true);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_service_performance_snapshot(p_service_id uuid, p_start date, p_end date, p_snapshot_type text DEFAULT 'custom'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid; total_requests numeric:=0; completed_deliveries numeric:=0; released_deliveries numeric:=0; outcomes numeric:=0; achieved numeric:=0; revisions numeric:=0; health numeric:=0; qfails numeric:=0;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 if p_snapshot_type not in ('daily','weekly','monthly','quarterly','custom') then raise exception 'Invalid snapshot type'; end if;
 select count(*) into total_requests from public.service_requests where service_id=p_service_id and created_at::date between p_start and p_end;
 select count(*) into completed_deliveries from public.ai_service_delivery_runs where service_id=p_service_id and status='completed' and created_at::date between p_start and p_end;
 select count(*) into released_deliveries from public.ai_client_deliveries d join public.ai_service_delivery_runs r on r.id=d.delivery_run_id where r.service_id=p_service_id and d.delivery_status in ('released','viewed','acknowledged','closed') and d.released_at::date between p_start and p_end;
 select count(*) into outcomes from public.client_service_outcomes o join public.service_requests sr on sr.id=o.service_request_id where sr.service_id=p_service_id and o.created_at::date between p_start and p_end;
 select count(*) into achieved from public.client_service_outcomes o join public.service_requests sr on sr.id=o.service_request_id where sr.service_id=p_service_id and o.status='achieved' and o.created_at::date between p_start and p_end;
 select count(*) into revisions from public.ai_workflow_revision_requests q join public.ai_service_delivery_runs r on r.id=q.delivery_run_id where r.service_id=p_service_id and q.created_at::date between p_start and p_end;
 select count(*) into qfails from public.ai_workflow_quality_evaluations q join public.ai_service_workflow_step_runs s on s.id=q.step_run_id join public.ai_service_workflow_executions e on e.id=s.execution_id join public.ai_service_delivery_runs r on r.id=e.delivery_run_id where r.service_id=p_service_id and q.passed=false and q.severity in ('critical','high') and q.created_at::date between p_start and p_end;
 health:=greatest(0,least(1,0.35*case when total_requests=0 then 1 else least(completed_deliveries/total_requests,1) end + 0.25*case when released_deliveries=0 then 1 else least(released_deliveries/greatest(completed_deliveries,1),1) end + 0.20*case when outcomes=0 then 0 else least(achieved/greatest(outcomes,1),1) end + 0.20*case when completed_deliveries=0 then 1 else greatest(0,1-least(revisions/greatest(completed_deliveries,1),1)) end));
 insert into public.service_performance_snapshots(service_id,period_start,period_end,snapshot_type,metrics,outcome_summary,quality_summary,efficiency_summary,health_score)
 values(p_service_id,p_start,p_end,p_snapshot_type,jsonb_build_object('service_requests',total_requests,'completed_deliveries',completed_deliveries,'released_deliveries',released_deliveries,'revisions',revisions),jsonb_build_object('outcomes',outcomes,'achieved',achieved,'achievement_rate',case when outcomes=0 then null else achieved/outcomes end),jsonb_build_object('quality_failures',qfails),jsonb_build_object('delivery_completion_rate',case when total_requests=0 then null else completed_deliveries/total_requests end,'revision_rate',case when completed_deliveries=0 then null else revisions/completed_deliveries end),health)
 on conflict(service_id,period_start,period_end,snapshot_type) do update set metrics=excluded.metrics,outcome_summary=excluded.outcome_summary,quality_summary=excluded.quality_summary,efficiency_summary=excluded.efficiency_summary,health_score=excluded.health_score,created_at=now() returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.get_ai_credit_admin_summary()
 RETURNS TABLE(active_subscribers bigint, total_allowance bigint, credits_consumed bigint, credits_reserved bigint, credits_remaining bigint, estimated_ai_cost_usd numeric, usage_events bigint, ledger_entries bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; v_consumed bigint; v_reserved bigint; begin
 select p.role into v_role from public.profiles p where p.id=(select auth.uid());
 if v_role not in ('admin','staff') then raise exception 'Staff/Admin access required'; end if;
 select coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0),coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0) into v_consumed,v_reserved from public.ai_credit_ledger l;
 return query select count(*)::bigint,coalesce(sum(p.monthly_credits),0)::bigint,v_consumed,v_reserved,greatest(coalesce(sum(p.monthly_credits),0)::bigint-v_consumed-v_reserved,0),
 coalesce((select sum(e.estimated_cost_usd) from public.ai_usage_events e),0)::numeric,(select count(*) from public.ai_usage_events)::bigint,(select count(*) from public.ai_credit_ledger)::bigint
 from public.ai_agent_subscriptions s join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
 where s.status in ('active','non_renewing') and p.active=true;
end; $function$


CREATE OR REPLACE FUNCTION public.get_ai_credit_admin_usage(p_limit integer DEFAULT 50)
 RETURNS TABLE(operation_key text, agent_key text, executions bigint, credits_consumed bigint, credits_reserved bigint, input_tokens bigint, output_tokens bigint, total_tokens bigint, estimated_cost_usd numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text; begin
 select p.role into v_role from public.profiles p where p.id=(select auth.uid());
 if v_role not in ('admin','staff') then raise exception 'Staff/Admin access required'; end if;
 return query select o.operation_key,o.agent_key,count(l.id)::bigint,
 coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0)::bigint,
 coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0)::bigint,
 coalesce(sum(e.input_tokens),0)::bigint,coalesce(sum(e.output_tokens),0)::bigint,coalesce(sum(e.total_tokens),0)::bigint,coalesce(sum(e.estimated_cost_usd),0)::numeric
 from public.ai_credit_operations o left join public.ai_credit_ledger l on l.operation_key=o.operation_key left join public.ai_usage_events e on e.run_id=l.execution_id
 group by o.operation_key,o.agent_key order by credits_consumed desc,executions desc limit greatest(1,least(coalesce(p_limit,50),200));
end; $function$


CREATE OR REPLACE FUNCTION public.get_ai_governance_dashboard(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; result jsonb;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized operations access required'; end if;
 if p_days < 1 or p_days > 90 then raise exception 'p_days must be between 1 and 90'; end if;
 select jsonb_build_object(
  'period_days',p_days,
  'summary',(select to_jsonb(s) from public.ai_governance_dashboard_summary s),
  'runtime_health',(select to_jsonb(h) from public.ai_governance_runtime_health h),
  'agents',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name),'[]'::jsonb) from public.ai_governance_agent_performance a),
  'quality',(select jsonb_build_object('evaluations',count(*),'passed',count(*) filter(where passed=true),'failed',count(*) filter(where passed=false),'critical_failed',count(*) filter(where passed=false and severity='critical')) from public.ai_workflow_quality_evaluations where created_at >= now()-(p_days||' days')::interval),
  'reviews',(select jsonb_build_object('total',count(*),'approved',count(*) filter(where decision='approved'),'revisions',count(*) filter(where decision='needs_revision'),'clarifications',count(*) filter(where decision='needs_clarification')) from public.ai_workflow_reviews where created_at >= now()-(p_days||' days')::interval),
  'improvement',(select jsonb_build_object('new',count(*) filter(where status='new'),'triaged',count(*) filter(where status='triaged'),'implemented',count(*) filter(where status='implemented')) from public.ai_improvement_signals),
  'usage',(select jsonb_build_object('tokens',coalesce(sum(total_tokens),0),'estimated_cost_usd',coalesce(sum(estimated_cost_usd),0),'events',count(*)) from public.ai_usage_events where created_at >= now()-(p_days||' days')::interval),
  'alerts',(select coalesce(jsonb_agg(to_jsonb(al) order by al.created_at desc),'[]'::jsonb) from (select id,alert_type,severity,status,title,description,agent_id,execution_id,created_at from public.ai_operational_alerts where status='open' order by created_at desc limit 50) al)
 ) into result;
 return result;
end; $function$


CREATE OR REPLACE FUNCTION public.get_ai_release_candidates()
 RETURNS SETOF ai_release_candidates
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin if auth.uid() is null then raise exception 'Authentication required'; end if; if not exists(select 1 from public.profiles where id=auth.uid() and status='active' and role in ('admin','staff')) then raise exception 'Active Admin or Staff access required'; end if; return query select * from public.ai_release_candidates order by created_at desc; end; $function$


CREATE OR REPLACE FUNCTION public.get_ai_revenue_payment_intelligence()
 RETURNS SETOF ai_revenue_payment_intelligence
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select * from public.ai_revenue_payment_intelligence; $function$


CREATE OR REPLACE FUNCTION public.get_ai_runtime_readiness()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
select jsonb_build_object(
 'active_agents',(select count(*) from public.ai_agent_registry where active=true),
 'configured_agents',(select count(*) from public.ai_agent_registry a where a.active=true and exists(select 1 from public.ai_agent_configuration_bindings b where b.agent_id=a.id and b.active=true)),
 'active_workflows',(select count(*) from public.ai_agent_workflows where active=true),
 'quality_gates',(select count(*) from public.ai_quality_gates where active=true),
 'runtime_deployed',exists(select 1 from public.ai_configuration_registry where config_type='system' and config_key='careerdev_ai_agent_runtime' and active=true),
 'jwt_required',true,
 'authenticated_execution_required',true
); $function$


CREATE OR REPLACE FUNCTION public.get_careerdev_financial_dashboard()
 RETURNS SETOF careerdev_financial_intelligence_dashboard
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select * from public.careerdev_financial_intelligence_dashboard; $function$


CREATE OR REPLACE FUNCTION public.get_my_ai_agent_access(p_agent_key text)
 RETURNS TABLE(allowed boolean, plan_key text, plan_name text, status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  u uuid := auth.uid();
  role_name text;
begin
  select role into role_name
  from public.profiles
  where id=u and status='active';

  if role_name in ('staff','admin') then
    return query
    select true, null::text, 'Staff/Admin Full Access'::text, 'privileged'::text;
    return;
  end if;

  return query
  select exists(
    select 1
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and (s.current_period_end is null or s.current_period_end > now())
      and p_agent_key = any(p.included_agents)
      and p.active=true
  ),
  (
    select s.plan_key
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.created_at desc limit 1
  ),
  (
    select p.name
    from public.ai_agent_subscriptions s
    join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and p.active=true
    order by s.created_at desc limit 1
  ),
  (
    select s.status
    from public.ai_agent_subscriptions s
    where s.user_id=u
      and s.status in ('active','non_renewing','attention')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.created_at desc limit 1
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.get_my_ai_credit_status()
 RETURNS TABLE(plan_key text, monthly_allowance integer, credits_consumed integer, credits_reserved integer, credits_remaining integer, period_start timestamp with time zone, period_end timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_sub public.ai_agent_subscriptions%rowtype;
  v_allowance integer := 0;
  v_start timestamptz;
  v_end timestamptz;
  v_consumed integer := 0;
  v_reserved integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select * into v_sub from public.ai_agent_subscriptions
  where user_id=v_user_id and status in ('active','non_renewing')
  order by updated_at desc limit 1;

  if not found then
    return query select null::text,0,0,0,0,now(),now();
    return;
  end if;

  select monthly_credits into v_allowance from public.ai_agent_subscription_plans where plan_key=v_sub.plan_key and active=true;
  v_start := date_trunc('month', coalesce(v_sub.current_period_start,now()));
  while v_start + interval '1 month' <= now() loop v_start := v_start + interval '1 month'; end loop;
  v_end := v_start + interval '1 month';

  select coalesce(sum(case when status='consumed' then credits else 0 end),0),
         coalesce(sum(case when status='reserved' then credits else 0 end),0)
    into v_consumed,v_reserved
  from public.ai_credit_ledger
  where user_id=v_user_id and period_start=v_start and period_end=v_end;

  return query select v_sub.plan_key,v_allowance,v_consumed,v_reserved,greatest(v_allowance-v_consumed-v_reserved,0),v_start,v_end;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_my_ai_subscription()
 RETURNS TABLE(subscription_id uuid, plan_key text, plan_name text, billing_interval text, status text, amount numeric, currency text, monthly_credits integer, included_agents text[], current_period_end timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select s.id, s.plan_key, p.name, s.billing_interval, s.status, s.amount, s.currency,
         p.monthly_credits, p.included_agents, s.current_period_end
  from public.ai_agent_subscriptions s
  join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
  where s.user_id=(select auth.uid())
    and s.status in ('active','non_renewing','attention')
    and (s.current_period_end is null or s.current_period_end > now())
  order by s.created_at desc
  limit 1
$function$


CREATE OR REPLACE FUNCTION public.get_my_calendly_connection()
 RETURNS TABLE(connected boolean, calendly_user_email text, calendly_user_name text, calendly_scheduling_url text, connected_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select true, c.calendly_user_email, c.calendly_user_name, c.calendly_scheduling_url, c.connected_at
  from public.calendly_connections c
  join public.coaches co on co.id=c.coach_id
  where co.profile_id=auth.uid() and c.active=true
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.get_my_coach_payout_history(p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, currency text, gross_coach_earnings numeric, payout_amount numeric, status text, provider_key text, provider_payout_reference text, release_check_status text, release_check_reason text, approved_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, failure_reason text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select mp.id, mp.currency, mp.gross_coach_earnings, mp.payout_amount, mp.status,
         mp.provider_key, mp.provider_payout_reference, mp.release_check_status,
         mp.release_check_reason, mp.approved_at, mp.created_at, mp.updated_at,
         mp.failure_reason
  from public.marketplace_payouts mp
  join public.coaches c on c.id = mp.coach_id
  where c.profile_id = auth.uid()
  order by mp.created_at desc
  limit greatest(1, least(coalesce(p_limit,25),100));
$function$


CREATE OR REPLACE FUNCTION public.get_my_coach_payout_summary()
 RETURNS TABLE(total_earned numeric, total_paid numeric, pending_payout numeric, payout_account_status text, payout_account_id uuid, payout_currency text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce((select sum(coach_earnings) from marketplace_transactions mt where mt.coach_id=c.id and mt.payment_status in ('paid','captured','settled')),0),
    coalesce((select sum(payout_amount) from marketplace_payouts mp where mp.coach_id=c.id and mp.status in ('paid','completed','success')),0),
    coalesce((select sum(payout_amount) from marketplace_payouts mp where mp.coach_id=c.id and mp.status in ('pending','approved','processing')),0),
    coalesce((select verification_status from coach_payout_accounts pa where pa.coach_id=c.id and pa.is_default=true limit 1),'not_configured'),
    (select pa.id from coach_payout_accounts pa where pa.coach_id=c.id and pa.is_default=true limit 1),
    coalesce((select pa.currency from coach_payout_accounts pa where pa.coach_id=c.id and pa.is_default=true limit 1),'NGN')
  from coaches c where c.profile_id=auth.uid();
$function$


CREATE OR REPLACE FUNCTION public.get_my_marketplace_payment_status(p_booking_id uuid)
 RETURNS TABLE(transaction_id uuid, booking_id uuid, gross_amount numeric, currency text, payment_status text, fulfillment_status text, release_eligibility text, provider_key text, provider_payment_reference text, payment_intent_id uuid, payment_intent_status text)
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select mt.id, mt.booking_id, mt.gross_amount, mt.currency, mt.payment_status,
         mt.fulfillment_status, mt.release_eligibility, mt.provider_key,
         mt.provider_payment_reference, pi.id, pi.status
  from public.marketplace_transactions mt
  join public.clients c on c.id=mt.client_id and c.profile_id=(select auth.uid())
  left join lateral (
    select i.id,i.status
    from public.marketplace_payment_intents i
    where i.transaction_id=mt.id
    order by i.created_at desc
    limit 1
  ) pi on true
  where mt.booking_id=p_booking_id;
$function$


CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'role', coalesce(p.role::text, null),
    'status', coalesce(p.status::text, null),
    'email', coalesce(p.email, null),
    'full_name', coalesce(p.full_name, null)
  )
  from public.profiles p
  where p.id = auth.uid();
$function$


CREATE OR REPLACE FUNCTION public.get_my_support_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'open_tickets',count(*) filter(where status in ('open','in_progress','waiting_on_customer')),
  'priority_tickets',count(*) filter(where priority_tier='priority'),
  'premium_tickets',count(*) filter(where priority_tier='premium'),
  'next_sla_target_at',min(sla_target_at) filter(where status in ('open','in_progress','waiting_on_customer')))
 from public.support_tickets where user_id=(select auth.uid());
$function$


CREATE OR REPLACE FUNCTION public.get_public_calendly_booking_links(p_coach_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(offering_id uuid, coach_id uuid, calendly_booking_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT o.id, o.coach_id, o.calendly_booking_url
  FROM public.coach_service_offerings AS o
  JOIN public.services AS s ON s.id = o.service_id AND s.active = true
  JOIN public.coaches AS c ON c.id = o.coach_id
  JOIN public.coach_marketplace_profiles AS p ON p.coach_id = c.id
  WHERE o.active = true
    AND o.calendly_booking_url IS NOT NULL
    AND p.verification_status = 'verified'
    AND p.marketplace_status = 'active'
    AND c.application_status::text IN ('approved', 'active')
    AND (p_coach_id IS NULL OR c.id = p_coach_id)
  ORDER BY o.id;
$function$


CREATE OR REPLACE FUNCTION public.get_public_coach_directory()
 RETURNS TABLE(coach_id uuid, display_name text, headline text, bio text, avatar_url text, country text, timezone text, years_coaching integer, specializations text[], coaching_formats text[], offering_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.coach_id,
         p.display_name,
         p.headline,
         p.bio,
         pr.avatar_url,
         p.country,
         p.timezone,
         p.years_coaching,
         p.specializations,
         p.coaching_formats,
         count(o.id)::integer as offering_count
  from public.coach_marketplace_profiles p
  join public.coaches c on c.id=p.coach_id
  left join public.profiles pr on pr.id=c.profile_id
  left join public.coach_service_offerings o on o.coach_id=c.id and o.active=true
  where p.verification_status='verified'
    and p.marketplace_status='active'
    and c.application_status::text in ('approved','active')
  group by p.coach_id,p.display_name,p.headline,p.bio,pr.avatar_url,p.country,p.timezone,p.years_coaching,p.specializations,p.coaching_formats
  order by lower(coalesce(p.display_name,''));
$function$


CREATE OR REPLACE FUNCTION public.get_public_coach_matching_candidates(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name),'[]'::jsonb)
  from (
    select cmp.coach_id, cmp.display_name, cmp.headline, cmp.bio,
      cmp.specializations, cmp.coaching_formats, cmp.languages,
      cmp.timezone, cmp.country, cmp.years_coaching,
      public.coach_semantic_source_text(cmp.coach_id) as source_text,
      (csp.embedding is not null) as has_embedding
    from public.coach_marketplace_profiles cmp
    join public.coaches c on c.id=cmp.coach_id
    left join public.coach_semantic_profiles csp on csp.coach_id=cmp.coach_id
    where cmp.verification_status='verified'
      and cmp.marketplace_status='active'
      and c.application_status='approved'
      and exists(select 1 from public.coach_availability ca where ca.coach_id=cmp.coach_id and ca.active=true and ca.end_time>ca.start_time)
    limit greatest(1,least(p_limit,50))
  ) x;
$function$


CREATE OR REPLACE FUNCTION public.get_public_coach_profile(p_coach_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select coalesce(jsonb_build_object(
 'coach_id',p.coach_id,'display_name',p.display_name,'headline',p.headline,'bio',p.bio,
 'specializations',to_jsonb(p.specializations),'coaching_formats',to_jsonb(p.coaching_formats),'languages',to_jsonb(p.languages),
 'timezone',p.timezone,'country',p.country,'years_coaching',p.years_coaching,'verification_status',p.verification_status,
 'profile_completion_pct',p.profile_completion_pct,'avatar_url',pr.avatar_url,
 'availability',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'day_of_week',a.day_of_week,'start_time',a.start_time,'end_time',a.end_time,'timezone',a.timezone) order by a.day_of_week,a.start_time) from coach_availability a where a.coach_id=p.coach_id and a.active=true),'[]'::jsonb),
 'offerings',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'service_id',o.service_id,'title',coalesce(o.title,s.name),'description',coalesce(o.description,s.description),'price',o.price,'currency',o.currency,'duration_minutes',o.duration_minutes,'delivery_mode',o.delivery_mode) order by o.created_at) from coach_service_offerings o left join services s on s.id=o.service_id where o.coach_id=p.coach_id and o.active=true),'[]'::jsonb),
 'credentials',to_jsonb(coalesce(c.credentials,array[]::text[])),'linkedin_url',c.linkedin_url,'website_url',c.website_url,'professional_title',c.professional_title,'professional_bio',c.professional_bio
),'{}'::jsonb)
from public.coach_marketplace_profiles p left join public.coaches c on c.id=p.coach_id left join public.profiles pr on pr.id=c.profile_id
where p.coach_id=p_coach_id and p.verification_status='verified' and p.marketplace_status='active' and c.application_status='approved';
$function$


CREATE OR REPLACE FUNCTION public.get_public_service_directory()
 RETURNS TABLE(offering_id uuid, service_id uuid, coach_id uuid, coach_name text, coach_avatar_url text, service_name text, category text, title text, description text, price numeric, currency text, duration_minutes integer, delivery_mode text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select o.id,
         s.id,
         c.id,
         p.display_name,
         pr.avatar_url,
         s.name,
         s.category,
         o.title,
         o.description,
         o.price,
         o.currency,
         o.duration_minutes,
         o.delivery_mode
  from public.coach_service_offerings o
  join public.services s on s.id=o.service_id and s.active=true
  join public.coaches c on c.id=o.coach_id
  join public.coach_marketplace_profiles p on p.coach_id=c.id
  left join public.profiles pr on pr.id=c.profile_id
  where o.active=true
    and p.verification_status='verified'
    and p.marketplace_status='active'
    and c.application_status::text in ('approved','active')
  order by lower(coalesce(s.name,'')), lower(coalesce(p.display_name,'')), lower(coalesce(o.title,''));
$function$


CREATE OR REPLACE FUNCTION public.get_service_unit_economics()
 RETURNS TABLE(service_id uuid, service_name text, service_currency text, service_catalog_price numeric, economics_version integer, pricing_model text, human_delivery_hours numeric, human_cost_rate numeric, target_ai_cost_ceiling numeric, target_gross_margin_pct numeric, ai_cost_usd numeric, total_tokens bigint, human_delivery_cost numeric, service_requests_with_usage bigint, avg_ai_cost_per_request_usd numeric, avg_human_cost_per_request numeric, revenue_recorded numeric, gross_profit numeric, gross_margin_pct numeric, calculated_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select * from public.service_unit_economics;
$function$


CREATE OR REPLACE FUNCTION public.is_ai_test_operator_v57()
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.profiles where id=auth.uid() and status='active' and role in ('admin','staff','coach')); $function$


CREATE OR REPLACE FUNCTION public.link_order_to_service_request(p_order_id uuid, p_service_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if not exists (select 1 from public.profiles where id=auth.uid() and status='active' and role in ('admin','staff')) then raise exception 'Not authorized'; end if;
 update public.orders set service_request_id=p_service_request_id, updated_at=now() where id=p_order_id;
 return found;
end; $function$


CREATE OR REPLACE FUNCTION public.list_public_available_coaches(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name), '[]'::jsonb)
  from (
    select cmp.coach_id, cmp.display_name, cmp.headline, cmp.bio,
      cmp.specializations, cmp.coaching_formats, cmp.languages,
      cmp.timezone, cmp.country, cmp.years_coaching
    from public.coach_marketplace_profiles cmp
    join public.coaches c on c.id=cmp.coach_id
    where cmp.verification_status='verified'
      and cmp.marketplace_status='active'
      and c.application_status='approved'
      and exists (
        select 1 from public.coach_availability ca
        where ca.coach_id=cmp.coach_id and ca.active=true
      )
    order by cmp.display_name
    limit greatest(1, least(coalesce(p_limit,20),50))
  ) x;
$function$


CREATE OR REPLACE FUNCTION public.mark_ai_output_review(p_output_version_id uuid, p_review_status text, p_review_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; x public.ai_output_versions%rowtype;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized reviewer access required'; end if;
 if p_review_status not in ('pending','approved','rejected','needs_revision','needs_clarification','not_required') then raise exception 'Invalid review status'; end if;
 select * into x from public.ai_output_versions where id=p_output_version_id for update;
 if not found then raise exception 'Output version not found'; end if;
 update public.ai_output_versions set review_status=p_review_status where id=x.id;
 insert into public.ai_audit_events(event_type,actor_type,actor_id,execution_type,execution_id,output_version_id,event_data)
 values('output_review_updated','user',u,x.execution_type,x.execution_id,x.id,jsonb_build_object('review_status',p_review_status,'review_notes',p_review_notes));
 return jsonb_build_object('output_version_id',x.id,'review_status',p_review_status);
end; $function$


CREATE OR REPLACE FUNCTION public.mark_ai_service_delivery_human_review(p_run_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.ai_service_delivery_runs%rowtype; v_user uuid:=auth.uid(); v_role text;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 if v_role not in ('admin','staff','coach') then raise exception 'Coach/staff review required'; end if;
 select * into v from public.ai_service_delivery_runs where id=p_run_id for update;
 if not found then raise exception 'Delivery run not found'; end if;
 if p_decision not in ('approved','rejected','needs_revision') then raise exception 'Invalid review decision'; end if;
 if v_role='coach' and not exists(select 1 from public.service_requests sr where sr.id=v.service_request_id and sr.assigned_coach=v_user) then raise exception 'Coach is not assigned to this request'; end if;
 update public.ai_service_delivery_runs set human_review_status=p_decision,status=case when p_decision='approved' then 'completed' when p_decision='rejected' then 'blocked' else 'awaiting_human_review' end,workflow_stage='human_review',quality_summary=coalesce(quality_summary,'{}'::jsonb)||jsonb_build_object('review_notes',p_notes,'reviewed_by',v_user,'reviewed_at',now()),completed_at=case when p_decision='approved' then now() else null end,updated_at=now() where id=p_run_id;
 return jsonb_build_object('run_id',p_run_id,'status',(select status from public.ai_service_delivery_runs where id=p_run_id),'human_review_status',p_decision);
end; $function$


CREATE OR REPLACE FUNCTION public.mark_coach_earnings_payable(p_transaction_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_ledger_id uuid;
begin
 select id into v_ledger_id from public.coach_earnings_ledger where metadata->>'marketplace_transaction_id'=p_transaction_id::text for update;
 if v_ledger_id is null then v_ledger_id:=public.create_coach_earnings_from_transaction(p_transaction_id); end if;
 update public.coach_earnings_ledger set ledger_status='payable',available_at=coalesce(available_at,now()),updated_at=now() where id=v_ledger_id and ledger_status in ('held','earned','pending','payable');
 return v_ledger_id;
end; $function$


CREATE OR REPLACE FUNCTION public.mark_coach_semantic_profile_stale()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  target_coach_id uuid;
begin
  if tg_table_name = 'coaches' then
    target_coach_id := coalesce(new.id, old.id);
  else
    target_coach_id := coalesce(new.coach_id, old.coach_id);
  end if;

  update public.coach_semantic_profiles
     set embedding = null,
         source_text = public.coach_semantic_source_text(target_coach_id),
         updated_at = now()
   where coach_id = target_coach_id;

  return coalesce(new, old);
end;
$function$


CREATE OR REPLACE FUNCTION public.mark_marketplace_notification_read(p_notification_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.marketplace_notifications
  set read_at = coalesce(read_at, now()),
      status = case when status in ('queued','sent','partially_sent') then 'read' else status end,
      updated_at = now()
  where id = p_notification_id and profile_id = auth.uid();
  if found then
    insert into public.marketplace_notification_events(notification_id,event_type,actor_type,actor_id)
    values (p_notification_id,'read',case when exists(select 1 from public.clients c where c.profile_id=auth.uid()) then 'client' else 'coach' end,auth.uid());
    return true;
  end if;
  return false;
end;
$function$


CREATE OR REPLACE FUNCTION public.mark_marketplace_service_completed(p_transaction_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_coach uuid;
BEGIN
  SELECT coach_id INTO v_coach FROM public.marketplace_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF v_coach IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
    WHERE c.id=v_coach AND p.id=auth.uid()
  ) THEN RAISE EXCEPTION 'Unauthorized coach'; END IF;

  UPDATE public.marketplace_transactions
  SET fulfillment_status='completed',
      release_eligibility=CASE WHEN release_eligibility='disputed' THEN 'disputed' ELSE 'eligible' END,
      updated_at=now()
  WHERE id=p_transaction_id
    AND payment_status IN ('funded','held')
    AND fulfillment_status IN ('not_started','in_progress');

  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction is not eligible for completion'; END IF;
  INSERT INTO public.marketplace_transaction_events(transaction_id,event_type,actor_type,actor_id)
  VALUES(p_transaction_id,'service_completed','coach',auth.uid());
  RETURN true;
END;
$function$


CREATE OR REPLACE FUNCTION public.marketplace_booking_notification_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  coach_profile uuid;
  client_profile uuid;
  service_title text;
  coach_name text;
  client_name text;
  when_text text;
begin
  select c.profile_id into coach_profile from public.coaches c where c.id = new.coach_id;
  select c.profile_id into client_profile from public.clients c where c.id = new.client_id;
  select coalesce(o.title, s.name, 'Coaching session') into service_title
    from public.marketplace_booking_requests b
    left join public.coach_service_offerings o on o.id = b.coach_service_offering_id
    left join public.services s on s.id = b.service_id
   where b.id = new.id;
  select coalesce(p.full_name, 'Your coach') into coach_name from public.profiles p where p.id = coach_profile;
  select coalesce(p.full_name, 'Your client') into client_name from public.profiles p where p.id = client_profile;
  when_text := coalesce(to_char(new.requested_start at time zone coalesce(new.timezone,'UTC'),'Mon DD, YYYY HH24:MI'), 'the requested time');

  if tg_op = 'INSERT' and new.booking_status = 'requested' and coach_profile is not null then
    insert into public.marketplace_notifications(profile_id,client_id,coach_id,booking_id,notification_type,category,priority,title,body,action_url,metadata)
    values (coach_profile,new.client_id,new.coach_id,new.id,'booking_request','booking','high','New coaching session request',client_name||' requested '||service_title||' for '||when_text||'.','/coach-dashboard',jsonb_build_object('booking_id',new.id));
  elsif tg_op = 'UPDATE' and new.booking_status is distinct from old.booking_status then
    if new.booking_status = 'confirmed' and client_profile is not null then
      insert into public.marketplace_notifications(profile_id,client_id,coach_id,booking_id,notification_type,category,priority,title,body,action_url,metadata)
      values (client_profile,new.client_id,new.coach_id,new.id,'booking_confirmed','booking','high','Your coaching session is confirmed',coach_name||' confirmed your '||service_title||' for '||when_text||'.','/client-dashboard',jsonb_build_object('booking_id',new.id));
    elsif new.booking_status = 'cancelled' and client_profile is not null then
      insert into public.marketplace_notifications(profile_id,client_id,coach_id,booking_id,notification_type,category,priority,title,body,action_url,metadata)
      values (client_profile,new.client_id,new.coach_id,new.id,'booking_cancelled','booking','high','Your coaching session was cancelled','The coaching session for '||when_text||' has been cancelled.','/client-dashboard',jsonb_build_object('booking_id',new.id));
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.marketplace_communication_risk_classify(p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare s text := lower(coalesce(p_body,'')); score numeric := 0; ext_contact boolean := false; ext_business boolean := false; reasons jsonb := '[]'::jsonb; begin if s ~ '(https?://|www\.)' then score := score + 25; reasons := reasons || jsonb_build_array('external_url'); end if; if s ~ '([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})' then score := score + 35; ext_contact := true; reasons := reasons || jsonb_build_array('email_address'); end if; if s ~ '(\+?[0-9][0-9 .()\-]{7,}[0-9])' then score := score + 30; ext_contact := true; reasons := reasons || jsonb_build_array('phone_number'); end if; if s ~ '(pay me directly|pay outside|outside the platform|off platform|whatsapp me|telegram me|contact me directly|let us continue privately|bank transfer|cashapp|venmo|paypal me|send payment)' then score := score + 45; ext_business := true; reasons := reasons || jsonb_build_array('off_platform_solicitation'); end if; if score > 100 then score := 100; end if; return jsonb_build_object('risk_score',score,'external_contact_detected',ext_contact,'external_business_intent_detected',ext_business,'reasons',reasons,'policy_action',case when score >= 80 then 'block' when score >= 60 then 'review' when score >= 35 then 'flag' when score >= 20 then 'warn' else 'allow' end); end $function$


CREATE OR REPLACE FUNCTION public.marketplace_notification_preference_allowed(p_profile_id uuid, p_preference_key text, p_channel text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_allowed boolean;
begin
  select case
    when p_channel='in_app' then in_app_enabled
    when p_channel='email' then email_enabled
    when p_channel='sms' then sms_enabled
    else false end
  and case p_preference_key
    when 'booking_updates' then booking_updates
    when 'payment_updates' then payment_updates
    when 'session_reminders' then session_reminders
    when 'messages' then messages
    when 'reviews' then reviews
    when 'verification_updates' then verification_updates
    when 'dispute_updates' then dispute_updates
    when 'marketing_enabled' then marketing_enabled
    else true end
  into v_allowed
  from public.marketplace_notification_preferences
  where profile_id=p_profile_id;
  return coalesce(v_allowed,true);
end;
$function$


CREATE OR REPLACE FUNCTION public.marketplace_payment_adapter_contract()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
select jsonb_build_object(
 'version','1.0',
 'operations',jsonb_build_array('create_payment_intent','authorize_or_fund','capture','refund','partial_refund','reverse','create_payout','reverse_payout','verify_webhook','reconcile'),
 'design_principles',jsonb_build_array('provider_agnostic','idempotent','signed_webhooks','immutable_event_history','server_side_secrets_only','multi_currency_ready')
);
$function$


CREATE OR REPLACE FUNCTION public.marketplace_schedule_reminders_on_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.schedule_marketplace_booking_reminders(new.id);
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.open_marketplace_dispute(p_transaction_id uuid, p_reason text, p_description text, p_requested_resolution text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_client uuid; v_coach uuid;
begin
 select client_id,coach_id into v_client,v_coach from public.marketplace_transactions where id=p_transaction_id;
 if not found then raise exception 'transaction_not_found'; end if;
 if (select auth.uid()) is null or (select auth.uid()) not in (v_client,v_coach) then raise exception 'not_authorized'; end if;
 insert into public.marketplace_disputes(transaction_id,opened_by,reason,description,status,requested_resolution,amount_at_risk,currency)
 select p_transaction_id,(select auth.uid()),p_reason,p_description,'open',p_requested_resolution,gross_amount,currency from public.marketplace_transactions where id=p_transaction_id
 returning id into v_id;
 insert into public.marketplace_dispute_events(dispute_id,event_type,actor_type,actor_id,event_data) values(v_id,'opened',case when (select auth.uid())=v_client then 'client' else 'coach' end,(select auth.uid()),jsonb_build_object('reason',p_reason));
 update public.marketplace_transactions set release_eligibility='disputed',updated_at=now() where id=p_transaction_id and release_eligibility <> 'released';
 return v_id;
end $function$


CREATE OR REPLACE FUNCTION public.prepare_ai_agent_execution(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  u uuid := auth.uid();
  role_name text;
  r public.ai_agent_execution_requests%rowtype;
  approval_required boolean;
  e uuid;
  snapshot_count integer;
begin
  select role into role_name from public.profiles where id=u and status='active';
  if role_name not in ('admin','staff','coach','client') then
    raise exception 'Authorized CareerDev Global access required';
  end if;

  select * into r from public.ai_agent_execution_requests where id=p_request_id for update;
  if not found then raise exception 'Execution request not found'; end if;
  if role_name in ('coach','client') and r.requested_by<>u then
    raise exception 'User may only prepare own requests';
  end if;
  if r.status not in ('authorized','prepared') then
    raise exception 'Request is not ready for preparation';
  end if;

  select ar.human_approval_required into approval_required
  from public.ai_agent_registry ar where ar.id=r.agent_id;

  if r.execution_id is null then
    insert into public.ai_agent_executions(
      agent_id,workflow_id,status,trigger_source,input_snapshot,
      human_review_required,human_review_status,created_by
    )
    values(
      r.agent_id,r.workflow_id,'authorized',r.trigger_source,r.input_payload,
      approval_required,case when approval_required then 'pending' else 'not_required' end,u
    )
    returning id into e;

    update public.ai_agent_execution_requests
    set execution_id=e,status='prepared'
    where id=r.id;
  else
    e:=r.execution_id;
    update public.ai_agent_execution_requests
    set status='prepared'
    where id=r.id;
  end if;

  select public.capture_ai_agent_configuration_snapshot(e) into snapshot_count;

  insert into public.ai_agent_execution_events(
    request_id,execution_id,event_type,event_data,actor_id
  )
  values(
    r.id,e,'configuration_captured',
    jsonb_build_object('snapshot_count',snapshot_count),u
  );

  return jsonb_build_object(
    'request_id',r.id,'execution_id',e,
    'snapshot_count',snapshot_count,'status','prepared'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.prepare_ai_intake_answer_context(p_answer_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e record; q record; r record; sr record; p record; result jsonb;
begin
 select ae.*,dq.question_text,dq.question_type,dq.options into e from public.dynamic_intake_answer_events ae join public.dynamic_intake_questions dq on dq.id=ae.question_id where ae.id=p_answer_event_id;
 if e.id is null then raise exception 'Answer event not found'; end if;
 if not (exists(select 1 from public.clients c join public.profiles pr on pr.id=c.profile_id where c.id=e.client_id and pr.id=(select auth.uid())) or exists(select 1 from public.profiles pr where pr.id=(select auth.uid()) and pr.role in('admin','staff','coach'))) then raise exception 'Not authorized'; end if;
 select * into r from public.dynamic_intake_requirements where id=e.requirement_id;
 select * into sr from public.service_requests where id=(select service_request_id from public.dynamic_intake_sessions where id=e.session_id);
 select * into p from public.career_profiles where id=(select career_profile_id from public.dynamic_intake_sessions where id=e.session_id);
 result:=jsonb_build_object('answer_event',jsonb_build_object('id',e.id,'answer',e.answer,'question_text',e.question_text,'question_type',e.question_type,'options',e.options),'requirement',to_jsonb(r),'service_request',to_jsonb(sr),'career_profile',to_jsonb(p));
 return result;
end; $function$


CREATE OR REPLACE FUNCTION public.prepare_ai_revision_request(p_revision_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; q public.ai_workflow_revision_requests%rowtype; e public.ai_service_workflow_executions%rowtype; attempt integer; rid uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized reviewer access required'; end if;
 select * into q from public.ai_workflow_revision_requests where id=p_revision_request_id for update;
 if not found then raise exception 'Revision request not found'; end if;
 select * into e from public.ai_service_workflow_executions where id=q.execution_id;
 if not found then raise exception 'Workflow execution not found'; end if;
 if role_name='coach' and not exists(select 1 from public.ai_service_delivery_runs d where d.id=q.delivery_run_id and exists(select 1 from public.service_requests s where s.id=d.service_request_id and s.assigned_coach=u)) then raise exception 'Coach may prepare only assigned revisions'; end if;
 if q.status not in ('open','queued') then raise exception 'Revision request is not ready'; end if;
 select coalesce(max(attempt_no),0)+1 into attempt from public.ai_workflow_revision_executions where revision_request_id=q.id;
 insert into public.ai_workflow_revision_executions(revision_request_id,execution_id,step_run_id,attempt_no,status,input_snapshot,created_by)
 values(q.id,q.execution_id,q.step_run_id,attempt,'pending',jsonb_build_object('instructions',q.instructions,'target_areas',q.target_areas,'previous_output',q.previous_output),u) returning id into rid;
 update public.ai_workflow_revision_requests set status='in_progress' where id=q.id;
 return jsonb_build_object('revision_execution_id',rid,'attempt_no',attempt,'status','pending');
end; $function$


CREATE OR REPLACE FUNCTION public.prepare_ai_service_workflow(p_delivery_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.ai_service_delivery_runs%rowtype; w public.service_ai_workflows%rowtype; v_user uuid:=auth.uid(); v_role text; v_exec uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into r from public.ai_service_delivery_runs where id=p_delivery_run_id for update;
 if not found then raise exception 'Delivery run not found'; end if;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user))) then raise exception 'Authorized coach/staff access required'; end if;
 if r.status<>'authorized' then raise exception 'Delivery run must be authorized before workflow preparation'; end if;
 select * into w from public.service_ai_workflows where service_id=r.service_id and active=true order by workflow_version desc limit 1;
 if w.id is null then raise exception 'Active AI workflow not configured for service'; end if;
 insert into public.ai_service_workflow_executions(delivery_run_id,workflow_id,workflow_version,status,current_step_order,context_snapshot)
 values(r.id,w.id,w.workflow_version,'pending',0,jsonb_build_object('input_snapshot',r.input_snapshot,'workflow_id',w.id,'workflow_version',w.workflow_version)) returning id into v_exec;
 update public.ai_service_delivery_runs set status='queued',workflow_stage='workflow_prepared',updated_at=now() where id=r.id;
 return jsonb_build_object('execution_id',v_exec,'workflow_id',w.id,'workflow_version',w.workflow_version,'status','pending');
end; $function$


CREATE OR REPLACE FUNCTION public.prepare_coach_payout_transfer(p_payout_id uuid)
 RETURNS TABLE(payout_id uuid, coach_id uuid, amount numeric, currency text, recipient_code text, transfer_reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_role text;
  p public.marketplace_payouts%rowtype;
  a public.coach_payout_accounts%rowtype;
  tx public.marketplace_transactions%rowtype;
  ref text;
begin
  select role::text into caller_role from public.profiles where id=auth.uid() and status='active';
  if caller_role not in ('admin','staff') then
    raise exception 'Staff/Admin access required';
  end if;

  select * into p from public.marketplace_payouts where id=p_payout_id for update;
  if not found then raise exception 'Payout not found'; end if;
  if p.status not in ('approved','processing') then raise exception 'Payout is not approved for transfer'; end if;
  if p.payout_amount is null or p.payout_amount <= 0 then raise exception 'Payout amount must be greater than zero'; end if;
  if p.currency <> 'NGN' then raise exception 'Only NGN payouts are currently enabled'; end if;
  if p.provider_payout_reference is not null and p.provider_payout_reference <> '' then
    ref := p.provider_payout_reference;
  else
    ref := 'CDG-PAYOUT-' || replace(p.id::text,'-','');
  end if;
  select * into a from public.coach_payout_accounts
    where id=p.payout_account_id and coach_id=p.coach_id and provider_key='paystack'
      and currency='NGN' and is_default=true for share;
  if not found or a.verification_status <> 'verified' or coalesce(a.recipient_code,'')='' then
    raise exception 'Verified default Paystack payout account is required';
  end if;
  select * into tx from public.marketplace_transactions where id=p.transaction_id;
  if not found then raise exception 'Source marketplace transaction not found'; end if;
  if tx.coach_id <> p.coach_id then raise exception 'Payout coach does not match transaction coach'; end if;
  if tx.payment_status not in ('paid','captured','settled') then raise exception 'Source transaction is not paid'; end if;
  if tx.release_eligibility is distinct from true then raise exception 'Transaction is not release eligible'; end if;
  update public.marketplace_payouts set provider_payout_reference=ref,status='processing',updated_at=now() where id=p.id;
  return query select p.id,p.coach_id,p.payout_amount,p.currency,a.recipient_code,ref;
end;
$function$


CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.id = auth.uid()
     AND (OLD.role IS DISTINCT FROM NEW.role
          OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'Users cannot change their own role or status';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.process_ai_quality_governance(p_step_run_id uuid, p_quality_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_service_workflow_step_runs%rowtype; e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; ag uuid; failed boolean:=coalesce((p_quality_summary->>'passed')::boolean,false)=false; critical boolean:=coalesce((p_quality_summary->>'critical_failure')::boolean,false); alert_id uuid; signal_id uuid; ov uuid;
begin
 select * into x from public.ai_service_workflow_step_runs where id=p_step_run_id; if not found then raise exception 'Step run not found'; end if;
 select * into e from public.ai_service_workflow_executions where id=x.execution_id;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 select agent_id into ag from public.ai_agent_executions ae where ae.id=e.id limit 1;
 select id into ov from public.ai_output_versions where step_run_id=x.id order by version_no desc limit 1;
 if ov is not null then perform public.mark_ai_output_review(ov,case when critical then 'rejected' when failed then 'needs_revision' else 'pending' end,case when critical then 'Critical quality gate failure' when failed then 'Quality gate failure requires human review' else 'Quality evaluation passed; human approval remains required' end); end if;
 if failed then
   alert_id:=public.create_ai_operational_alert(case when critical then 'critical_quality_failure' else 'quality_failure' end,case when critical then 'critical' else 'high' end,case when critical then 'Critical AI quality gate failure' else 'AI quality gate failure requires review' end,coalesce(p_quality_summary->>'results','AI workflow output failed one or more quality gates.'),ag,e.id,r.service_id,r.id,null,p_quality_summary);
   signal_id:=public.create_ai_improvement_signal(case when critical then 'quality_failure' else 'human_review' end,case when critical then 'Critical quality failure in AI workflow step' else 'Quality failure requiring human review' end,r.service_id,r.id,x.id,p_quality_summary,case when critical then 'critical' else 'high' end);
 end if;
 return jsonb_build_object('step_run_id',x.id,'output_version_id',ov,'failed',failed,'critical_failure',critical,'alert_id',alert_id,'improvement_signal_id',signal_id);
end; $function$


CREATE OR REPLACE FUNCTION public.process_due_marketplace_reminders(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r record; run_id uuid; n integer:=0; v_profile uuid; v_notification uuid;
begin
 insert into public.marketplace_reminder_runs default values returning id into run_id;
 for r in select s.*,coalesce(o.title,'coaching session') as service_name
   from public.marketplace_notification_schedules s
   join public.marketplace_booking_requests b on b.id=s.booking_id
   left join public.coach_service_offerings o on o.id=b.coach_service_offering_id
   where s.status='scheduled' and s.scheduled_for<=now() and b.booking_status='confirmed'
   order by s.scheduled_for for update of s skip locked limit greatest(coalesce(p_limit,100),1)
 loop
   update public.marketplace_notification_schedules set status='queued',updated_at=now() where id=r.id and status='scheduled';
   select profile_id into v_profile from public.clients where id=r.client_id;
   if v_profile is not null then
     v_notification:=public.create_marketplace_event_notification(v_profile,r.client_id,r.coach_id,r.booking_id,null,'session_reminder','booking','high',case when r.reminder_type='session_24h' then 'Session reminder: 24 hours' when r.reminder_type='session_1h' then 'Session reminder: 1 hour' else 'Your coaching session starts now' end,case when r.reminder_type='session_24h' then 'Your '||r.service_name||' session is scheduled for tomorrow.' when r.reminder_type='session_1h' then 'Your '||r.service_name||' session starts in about one hour.' else 'Your '||r.service_name||' session is scheduled to start now.' end,'/client/bookings',now(),jsonb_build_object('reminder_type',r.reminder_type,'scheduled_for',r.scheduled_for),'session_reminders');
   end if;
   select profile_id into v_profile from public.coaches where id=r.coach_id;
   if v_profile is not null then
     v_notification:=public.create_marketplace_event_notification(v_profile,r.client_id,r.coach_id,r.booking_id,null,'session_reminder','booking','high',case when r.reminder_type='session_24h' then 'Session reminder: 24 hours' when r.reminder_type='session_1h' then 'Session reminder: 1 hour' else 'Your coaching session starts now' end,case when r.reminder_type='session_24h' then 'Your '||r.service_name||' session is scheduled for tomorrow.' when r.reminder_type='session_1h' then 'Your '||r.service_name||' session starts in about one hour.' else 'Your '||r.service_name||' session is scheduled to start now.' end,'/coach/bookings',now(),jsonb_build_object('reminder_type',r.reminder_type,'scheduled_for',r.scheduled_for),'session_reminders');
   end if;
   update public.marketplace_notification_schedules set notification_id=coalesce(v_notification,notification_id),status='sent',updated_at=now() where id=r.id;
   n:=n+1;
 end loop;
 update public.marketplace_reminder_runs set run_finished_at=now(),scanned_count=n,queued_count=n,status='completed' where id=run_id;
 return n;
exception when others then
 update public.marketplace_reminder_runs set run_finished_at=now(),status='failed',error_message=sqlerrm where id=run_id; raise;
end; $function$


CREATE OR REPLACE FUNCTION public.process_dynamic_intake_answer(p_question_id uuid, p_answer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare q record; v_effect text; v_conf numeric; v_next text; v_score numeric; v_open int; v_total int; v_event uuid;
begin
 select q.id,q.session_id,q.client_id,q.requirement_id,q.status,r.priority,r.requirement_type into q from public.dynamic_intake_questions q join public.dynamic_intake_requirements r on r.id=q.requirement_id where q.id=p_question_id;
 if q.id is null then raise exception 'Question not found'; end if;
 if not (exists(select 1 from public.clients c join public.profiles p on p.id=c.profile_id where c.id=q.client_id and p.id=(select auth.uid())) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in('admin','staff','coach'))) then raise exception 'Not authorized'; end if;
 if p_answer is null or p_answer='null'::jsonb or trim(coalesce(p_answer #>> '{}',''))='' then v_effect:='insufficient'; v_conf:=.25; v_next:='clarification'; else v_effect:='satisfied'; v_conf:=.90; v_next:='evaluate_next_requirement'; end if;
 update public.dynamic_intake_questions set answer=p_answer,answered_at=now(),status=case when v_effect='satisfied' then 'answered' else 'answered' end where id=p_question_id;
 update public.dynamic_intake_requirements set status=case when v_effect='satisfied' then 'satisfied' else 'needs_review' end,updated_at=now() where id=q.requirement_id;
 insert into public.dynamic_intake_answer_events(question_id,session_id,client_id,answer,interpretation,confidence,requirement_effect,next_action,processed_by) values(p_question_id,q.session_id,q.client_id,p_answer,case when v_effect='satisfied' then 'Answer received and provisionally satisfies the requirement.' else 'Answer is empty or insufficient and requires clarification.' end,v_conf,v_effect,v_next,(select auth.uid())) returning id into v_event;
 select count(*) filter(where status='open' or status='needs_review')::int,count(*)::int into v_open,v_total from public.dynamic_intake_requirements where session_id=q.session_id;
 v_score:=case when v_total=0 then 1 else greatest(0,least(1,(v_total-v_open)::numeric/v_total)) end;
 update public.dynamic_intake_sessions set status=case when v_open=0 then 'ready' else 'active' end,current_step=case when v_open=0 then 'ready_for_service_delivery' else 'answer_processed' end,completion_score=v_score,completed_at=case when v_open=0 then now() else null end,updated_at=now() where id=q.session_id;
 return jsonb_build_object('event_id',v_event,'requirement_effect',v_effect,'confidence',v_conf,'next_action',v_next,'completion_score',v_score,'remaining_requirements',v_open);
end; $function$


CREATE OR REPLACE FUNCTION public.process_marketplace_notification_event(p_source_table text, p_source_record_id uuid, p_event_type text, p_event_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_event_id uuid; v_count integer:=0; r record; v_profile uuid; v_client uuid; v_coach uuid; v_booking uuid; v_transaction uuid; v_title text; v_body text; v_action text;
begin
  insert into public.marketplace_notification_automation_events(source_table,source_record_id,event_type,event_payload)
  values(p_source_table,p_source_record_id,p_event_type,coalesce(p_event_payload,'{}'::jsonb)) returning id into v_event_id;
  for r in select * from public.marketplace_notification_rules where active and event_source=p_source_table and event_type=p_event_type loop
    v_client := nullif(p_event_payload->>'client_id','')::uuid;
    v_coach := nullif(p_event_payload->>'coach_id','')::uuid;
    v_booking := nullif(p_event_payload->>'booking_id','')::uuid;
    v_transaction := nullif(p_event_payload->>'transaction_id','')::uuid;
    if r.recipient_role='client' then select profile_id into v_profile from public.clients where id=v_client;
    elsif r.recipient_role='coach' then select profile_id into v_profile from public.coaches where id=v_coach;
    else v_profile:=null; end if;
    if v_profile is null then continue; end if;
    v_title:=replace(r.title_template,'{{client_name}}',coalesce(p_event_payload->>'client_name','there'));
    v_title:=replace(v_title,'{{coach_name}}',coalesce(p_event_payload->>'coach_name','your coach'));
    v_body:=replace(r.body_template,'{{service_name}}',coalesce(p_event_payload->>'service_name','your coaching service'));
    v_body:=replace(v_body,'{{coach_name}}',coalesce(p_event_payload->>'coach_name','your coach'));
    v_body:=replace(v_body,'{{client_name}}',coalesce(p_event_payload->>'client_name','your client'));
    v_action:=r.action_path_template;
    v_count:=v_count+1;
    perform public.create_marketplace_event_notification(v_profile,v_client,v_coach,v_booking,v_transaction,r.notification_type,r.category,r.priority,v_title,v_body,v_action,now()+make_interval(secs=>r.delay_seconds),p_event_payload,r.preference_key);
  end loop;
  update public.marketplace_notification_automation_events set status='processed',processed_at=now() where id=v_event_id;
  return v_count;
exception when others then
  update public.marketplace_notification_automation_events set status='failed',error_message=sqlerrm,processed_at=now() where id=v_event_id;
  raise;
end;
$function$


CREATE OR REPLACE FUNCTION public.protect_coach_verification_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.coaches c where c.id=new.coach_id and c.profile_id=(select auth.uid())) then
    if tg_op='INSERT' then
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    elsif tg_op='UPDATE' then
      new.status := old.status;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.publish_coach_career_insight(p_title text, p_slug text, p_excerpt text, p_content text, p_category text DEFAULT 'Career Development'::text, p_tags text[] DEFAULT '{}'::text[], p_featured_image_url text DEFAULT NULL::text)
 RETURNS blog_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_post public.blog_posts; v_user uuid := auth.uid(); v_image text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if not exists (select 1 from public.profiles p where p.id=v_user and p.role::text='coach' and p.status='active') then raise exception 'Only active Career Coaches can publish Career Insights'; end if;
 if not exists (select 1 from public.coaches c where c.profile_id=v_user and c.application_status::text='approved' and c.approved_at is not null) then raise exception 'Your coach profile must be approved before publishing Career Insights'; end if;
 if nullif(trim(p_title),'') is null or nullif(trim(p_slug),'') is null or nullif(trim(p_excerpt),'') is null or nullif(trim(p_content),'') is null then raise exception 'Title, slug, excerpt and content are required'; end if;
 if exists (select 1 from public.blog_posts b where b.slug=trim(p_slug)) then raise exception 'An insight with this slug already exists'; end if;
 v_image:=coalesce(nullif(trim(p_featured_image_url),''),'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1800&q=85');
 insert into public.blog_posts(title,slug,excerpt,content,category,tags,featured_image_url,author_id,status,featured,seo_title,seo_description,og_image_url,ai_generated,ai_generation_notes,published_at)
 values(trim(p_title),trim(p_slug),trim(p_excerpt),p_content,coalesce(nullif(trim(p_category),''),'Career Development'),coalesce(p_tags,'{}'),v_image,v_user,'published',false,trim(p_title),trim(p_excerpt),v_image,false,'Coach-published Career Insight',now())
 returning * into v_post;
 return v_post;
end; $function$


CREATE OR REPLACE FUNCTION public.publish_coach_marketplace_profile(p_coach_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin if not exists(select 1 from public.coaches where id=p_coach_id and application_status in ('approved','active')) then raise exception 'Coach is not approved for marketplace publishing'; end if; update public.coach_marketplace_profiles set marketplace_status='active',updated_at=now() where coach_id=p_coach_id; if not found then raise exception 'Marketplace profile not found'; end if; end; $function$


CREATE OR REPLACE FUNCTION public.queue_careerdev_order_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_first_name text;
  v_service text;
  v_event text;
  v_message text;
  v_order_url text;
  v_feedback_url text;
begin
  select p.email, split_part(coalesce(p.full_name,''), ' ', 1)
    into v_email, v_first_name
  from public.clients c join public.profiles p on p.id=c.profile_id
  where c.id=new.client_id;
  if v_email is null then return new; end if;

  select s.name into v_service from public.services s where s.id=new.service_id;
  v_service := coalesce(v_service, 'CareerDev Global Service');
  v_order_url := 'https://careerdevglobal-career-dev-global.vercel.app/dashboard/orders/' || new.id::text;
  v_feedback_url := v_order_url || '?feedback=1';

  if tg_op='INSERT' then
    v_event := 'order_received';
    v_message := 'We received your service request and will keep you updated as it progresses.';
  elsif new.status is distinct from old.status then
    if new.status='paid' then return new;
    elsif new.status='completed' then
      v_event := 'service_completed';
      v_message := 'Your CareerDev Global service has been completed.';
    else
      v_event := 'order_status';
      v_message := 'Your request status has been updated to ' || replace(new.status::text,'_',' ') || '.';
    end if;
  else return new;
  end if;

  insert into public.email_notification_queue(event_type,order_id,email,first_name,params,scheduled_for)
  values(v_event,new.id,v_email,coalesce(nullif(v_first_name,''),'there'),
    jsonb_build_object(
      'FIRSTNAME',coalesce(nullif(v_first_name,''),'there'),
      'SERVICE_NAME',v_service,
      'ORDER_REFERENCE',left(new.id::text,8),
      'AMOUNT',coalesce(new.currency,'') || ' ' || coalesce(to_char(new.amount,'FM9999999990.00'),'0.00'),
      'STATUS',replace(new.status::text,'_',' '),
      'STATUS_MESSAGE',v_message,
      'ORDER_URL',v_order_url,
      'DASHBOARD_URL','https://careerdevglobal-career-dev-global.vercel.app/dashboard',
      'FEEDBACK_URL',v_feedback_url
    ),now())
  on conflict (order_id,event_type) where order_id is not null do nothing;

  if v_event='service_completed' then
    insert into public.email_notification_queue(event_type,order_id,email,first_name,params,scheduled_for)
    values('feedback_request',new.id,v_email,coalesce(nullif(v_first_name,''),'there'),
      jsonb_build_object('FIRSTNAME',coalesce(nullif(v_first_name,''),'there'),'FEEDBACK_URL',v_feedback_url,
        'SERVICE_NAME',v_service,'ORDER_REFERENCE',left(new.id::text,8)),now()+interval '24 hours')
    on conflict (order_id,event_type) where order_id is not null do nothing;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.queue_document_processing(p_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_job_id uuid;
  v_client_id uuid;
  v_request_id uuid;
begin
  select d.client_id, d.request_id into v_client_id, v_request_id
  from public.documents d
  where d.id = p_document_id;
  if v_client_id is null then raise exception 'Document not found'; end if;
  if not exists (select 1 from public.clients c where c.id=v_client_id and c.profile_id=auth.uid())
     and not exists (select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role in ('coach','staff','admin')) then
    raise exception 'Forbidden';
  end if;
  insert into public.document_processing_jobs(document_id,client_id,request_id,status,stage,attempt_count)
  values(p_document_id,v_client_id,v_request_id,'queued','queued',0)
  on conflict (document_id) do update set status='queued',stage='queued',error_code=null,error_message=null,updated_at=now()
  returning id into v_job_id;
  return v_job_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.reconcile_marketplace_payment(p_reconciliation_id uuid, p_resolution_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.marketplace_payment_reconciliation%rowtype; t public.marketplace_transactions%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.marketplace_payment_reconciliation where id=p_reconciliation_id for update;
 if not found then raise exception 'Reconciliation record not found'; end if;
 if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('staff','admin')) then raise exception 'Staff or admin access required'; end if;
 select * into t from public.marketplace_transactions where id=r.transaction_id for update;
 if not found then raise exception 'Marketplace transaction not found'; end if;
 if r.currency <> t.currency or r.expected_amount <> t.gross_amount then
   update public.marketplace_payment_reconciliation set reconciliation_status='mismatch',resolution_notes=coalesce(p_resolution_notes,'Expected amount or currency does not match marketplace transaction.'),resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=r.id;
   return;
 end if;
 if r.provider_amount <> r.expected_amount then
   update public.marketplace_payment_reconciliation set reconciliation_status='mismatch',resolution_notes=coalesce(p_resolution_notes,'Provider amount does not match expected amount.'),resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=r.id;
   return;
 end if;
 update public.marketplace_payment_reconciliation set reconciliation_status='matched',resolution_notes=p_resolution_notes,resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=r.id;
end; $function$


CREATE OR REPLACE FUNCTION public.record_ai_output_version(p_execution_type text, p_execution_id uuid, p_step_run_id uuid DEFAULT NULL::uuid, p_revision_execution_id uuid DEFAULT NULL::uuid, p_output jsonb DEFAULT '{}'::jsonb, p_configuration jsonb DEFAULT '{}'::jsonb, p_quality_summary jsonb DEFAULT '{}'::jsonb, p_review_status text DEFAULT 'pending'::text, p_source_output_id uuid DEFAULT NULL::uuid, p_source_type text DEFAULT NULL::text, p_source_location text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; next_version integer; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized AI review access required'; end if;
 if p_execution_type not in ('agent','service_workflow','workflow_step','revision','document_intelligence','intake','other') then raise exception 'Invalid execution type'; end if;
 if p_review_status not in ('pending','approved','rejected','needs_revision','needs_clarification','not_required') then raise exception 'Invalid review status'; end if;
 select coalesce(max(version_no),0)+1 into next_version from public.ai_output_versions where execution_type=p_execution_type and execution_id=p_execution_id;
 insert into public.ai_output_versions(execution_type,execution_id,step_run_id,revision_execution_id,version_no,output_snapshot,output_hash,source_output_id,source_type,source_location,configuration_snapshot,quality_summary,review_status,created_by)
 values(p_execution_type,p_execution_id,p_step_run_id,p_revision_execution_id,next_version,p_output,encode(digest(coalesce(p_output,'{}'::jsonb)::text,'sha256'),'hex'),p_source_output_id,p_source_type,p_source_location,coalesce(p_configuration,'{}'::jsonb),coalesce(p_quality_summary,'{}'::jsonb),p_review_status,u)
 returning id into v_id;
 insert into public.ai_audit_events(event_type,actor_type,actor_id,execution_type,execution_id,output_version_id,event_data)
 values('output_version_created','user',u,p_execution_type,p_execution_id,v_id,jsonb_build_object('version_no',next_version,'review_status',p_review_status));
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.record_ai_revision_output(p_revision_execution_id uuid, p_output jsonb, p_configuration jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_workflow_revision_executions%rowtype; q public.ai_workflow_revision_requests%rowtype; u uuid:=auth.uid(); role_name text;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized reviewer access required'; end if;
 select * into x from public.ai_workflow_revision_executions where id=p_revision_execution_id for update;
 if not found then raise exception 'Revision execution not found'; end if;
 select * into q from public.ai_workflow_revision_requests where id=x.revision_request_id;
 if role_name='coach' and not exists(select 1 from public.ai_service_delivery_runs d where d.id=q.delivery_run_id and exists(select 1 from public.service_requests s where s.id=d.service_request_id and s.assigned_coach=u)) then raise exception 'Coach access denied'; end if;
 if x.status not in ('pending','running','awaiting_quality') then raise exception 'Revision execution not writable from status %',x.status; end if;
 update public.ai_workflow_revision_executions set status='awaiting_quality',output_snapshot=p_output,configuration_snapshot=coalesce(p_configuration,'{}'::jsonb) where id=x.id;
 return jsonb_build_object('revision_execution_id',x.id,'status','awaiting_quality','quality_evaluation_required',true);
end; $function$


CREATE OR REPLACE FUNCTION public.record_ai_service_workflow_step_output(p_step_run_id uuid, p_output jsonb, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_service_workflow_step_runs%rowtype; e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; v_user uuid:=auth.uid(); v_role text; v_output_version uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into x from public.ai_service_workflow_step_runs where id=p_step_run_id for update;
 if not found then raise exception 'Step run not found'; end if;
 select * into e from public.ai_service_workflow_executions where id=x.execution_id;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user))) then raise exception 'Authorized coach/staff access required'; end if;
 if x.status not in ('running','pending') then raise exception 'Step is not writable from status %',x.status; end if;
 update public.ai_service_workflow_step_runs set status='running',output_snapshot=p_output,error_message=p_error,updated_at=now() where id=x.id;
 update public.ai_service_workflow_executions set status='running',output_snapshot=p_output,error_message=p_error,updated_at=now() where id=e.id;
 update public.ai_service_delivery_runs set status='running',output_snapshot=p_output,error_message=p_error,updated_at=now() where id=r.id;
 if p_error is null then
   v_output_version := public.record_ai_output_version(
     'workflow_step', e.id, x.id, null, p_output, null,
     jsonb_build_object('status','awaiting_quality','quality_evaluated',false), 'pending', null, 'service_workflow_step', x.id::text
   );
   perform public.add_ai_output_provenance(v_output_version,'service_request',r.service_request_id,null,'request_id','Authorized service request context','contextual',null,'{}'::jsonb);
   perform public.add_ai_output_provenance(v_output_version,'service_data',r.id,null,'delivery_run_id','Service delivery run context','contextual',null,'{}'::jsonb);
 end if;
 return jsonb_build_object('step_run_id',x.id,'execution_id',e.id,'status','output_recorded','quality_evaluation_required',true,'output_version_id',v_output_version);
end; $function$


CREATE OR REPLACE FUNCTION public.record_ai_service_workflow_step_result(p_step_run_id uuid, p_status text, p_output jsonb, p_quality_results jsonb DEFAULT '[]'::jsonb, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x public.ai_service_workflow_step_runs%rowtype; e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; n public.ai_service_workflow_steps%rowtype; v_user uuid:=auth.uid(); v_role text; v_next uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into x from public.ai_service_workflow_step_runs where id=p_step_run_id for update;
 if not found then raise exception 'Step run not found'; end if;
 select * into e from public.ai_service_workflow_executions where id=x.execution_id for update;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user))) then raise exception 'Authorized coach/staff access required'; end if;
 if p_status not in ('completed','failed','blocked','awaiting_review') then raise exception 'Invalid step status'; end if;
 update public.ai_service_workflow_step_runs set status=p_status,output_snapshot=p_output,quality_results=coalesce(p_quality_results,'[]'::jsonb),error_message=p_error,completed_at=case when p_status in ('completed','failed','blocked') then now() else null end,updated_at=now() where id=x.id;
 if p_status in ('failed','blocked') then
   update public.ai_service_workflow_executions set status=p_status,current_step_order=x.step_order,output_snapshot=p_output,quality_results=coalesce(p_quality_results,'[]'::jsonb),error_message=p_error,updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status=p_status,workflow_stage='blocked_at_step_'||x.step_order,error_message=p_error,updated_at=now() where id=r.id;
   return jsonb_build_object('execution_id',e.id,'status',p_status,'blocked',true,'step_order',x.step_order);
 end if;
 if p_status='awaiting_review' then
   update public.ai_service_workflow_executions set status='awaiting_review',output_snapshot=p_output,quality_results=coalesce(p_quality_results,'[]'::jsonb),updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='human_review_step_'||x.step_order,output_snapshot=p_output,quality_summary=coalesce(p_quality_results,'[]'::jsonb),updated_at=now() where id=r.id;
   return jsonb_build_object('execution_id',e.id,'status','awaiting_review','human_review_required',true);
 end if;
 select * into n from public.ai_service_workflow_steps where workflow_id=e.workflow_id and active=true and step_order>x.step_order order by step_order limit 1;
 if n.id is null then
   update public.ai_service_workflow_executions set status='completed',current_step_order=x.step_order,output_snapshot=p_output,quality_results=coalesce(p_quality_results,'[]'::jsonb),completed_at=now(),updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='final_human_review',output_snapshot=p_output,quality_summary=coalesce(p_quality_results,'[]'::jsonb),updated_at=now() where id=r.id;
   return jsonb_build_object('execution_id',e.id,'status','completed','next_step',null,'human_review_required',true);
 end if;
 insert into public.ai_service_workflow_step_runs(execution_id,step_id,step_order,status,input_snapshot)
 values(e.id,n.id,n.step_order,'pending',jsonb_build_object('previous_output',p_output,'execution_context',e.context_snapshot)) on conflict(execution_id,step_id) do nothing returning id into v_next;
 update public.ai_service_workflow_executions set current_step_order=n.step_order,output_snapshot=p_output,updated_at=now() where id=e.id;
 return jsonb_build_object('execution_id',e.id,'status','next_step_ready','step_run_id',v_next,'step_order',n.step_order,'step_key',n.step_key,'human_review_required',n.human_review_required);
end; $function$


CREATE OR REPLACE FUNCTION public.record_ai_test_suite_result(p_case_id uuid, p_actual_output jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_case public.ai_test_suite_cases%rowtype;
  v_run_id uuid;
  v_suite_run_id uuid;
  v_expected jsonb;
  v_key text;
  v_expected_value numeric;
  v_actual_value numeric;
  v_pass boolean;
  v_all_pass boolean := true;
  v_assertions jsonb := '{}'::jsonb;
  v_expected_status text;
  v_actual_status text;
  v_role text;
begin
  select p.role into v_role from public.profiles p where p.id = (select auth.uid());
  if v_role is null or v_role not in ('admin','staff','coach') then
    raise exception 'Not authorized to run AI evaluation tests';
  end if;

  select * into v_case from public.ai_test_suite_cases where id = p_case_id and active = true;
  if not found then raise exception 'Active test suite case not found'; end if;

  v_expected := v_case.expected_output;
  v_expected_status := v_case.expected_status;
  v_actual_status := coalesce(p_actual_output->>'decision_status', p_actual_output->>'status', 'passed');

  insert into public.ai_test_runs (test_case_id, run_type, status, input_snapshot, output_snapshot, executed_by, started_at, completed_at)
  values (null, 'document_intelligence', 'running', v_case.input_payload, p_actual_output, (select auth.uid()), now(), null)
  returning id into v_run_id;

  for v_key in select jsonb_object_keys(v_expected)
  loop
    if v_key = 'expected_behavior' then continue; end if;
    if jsonb_typeof(v_expected->v_key) = 'number' then
      v_expected_value := (v_expected->>v_key)::numeric;
      if jsonb_typeof(p_actual_output->v_key) = 'number' then
        v_actual_value := (p_actual_output->>v_key)::numeric;
        v_pass := v_actual_value >= v_expected_value;
      else
        v_actual_value := null;
        v_pass := false;
      end if;
    elsif jsonb_typeof(v_expected->v_key) = 'boolean' then
      v_pass := coalesce((p_actual_output->>v_key)::boolean = (v_expected->>v_key)::boolean, false);
      v_expected_value := null;
      v_actual_value := null;
    else
      continue;
    end if;
    if not v_pass then v_all_pass := false; end if;
    v_assertions := v_assertions || jsonb_build_object(v_key, jsonb_build_object('expected', v_expected->v_key, 'actual', p_actual_output->v_key, 'passed', v_pass));
  end loop;

  if v_actual_status is distinct from v_expected_status then
    v_all_pass := false;
    v_assertions := v_assertions || jsonb_build_object('decision_status', jsonb_build_object('expected', v_expected_status, 'actual', v_actual_status, 'passed', false));
  else
    v_assertions := v_assertions || jsonb_build_object('decision_status', jsonb_build_object('expected', v_expected_status, 'actual', v_actual_status, 'passed', true));
  end if;

  update public.ai_test_runs
  set status = case when v_all_pass then 'passed' else 'failed' end,
      assertions = v_assertions,
      completed_at = now()
  where id = v_run_id;

  insert into public.ai_test_suite_runs (suite_case_id, test_run_id, status, actual_output, assertions, executed_by, started_at, completed_at)
  values (p_case_id, v_run_id, case when v_all_pass then 'passed' else 'failed' end, p_actual_output, v_assertions, (select auth.uid()), now(), now())
  returning id into v_suite_run_id;

  return jsonb_build_object('suite_run_id', v_suite_run_id, 'test_run_id', v_run_id, 'case', v_case.name, 'status', case when v_all_pass then 'passed' else 'failed' end, 'assertions', v_assertions);
end;
$function$


CREATE OR REPLACE FUNCTION public.record_ai_usage_event(p_execution_type text, p_execution_id uuid, p_agent_id uuid, p_workflow_id uuid, p_model text, p_input_tokens integer DEFAULT NULL::integer, p_output_tokens integer DEFAULT NULL::integer, p_total_tokens integer DEFAULT NULL::integer, p_estimated_cost numeric DEFAULT NULL::numeric, p_duration_ms integer DEFAULT NULL::integer, p_status text DEFAULT 'completed'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; x uuid; req uuid; client uuid; service_scope text; workflow_name text;begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized operations access required'; end if;
 select r.id,r.client_id,r.service_id into req,client,service_scope from public.service_requests r where r.id=p_execution_id limit 1;
 if req is null then select e.service_request_id,e.client_id,e.service_id into req,client,service_scope from public.ai_service_delivery_runs e where e.id=p_execution_id limit 1; end if;
 if req is null then select w.delivery_run_id into req from public.ai_service_workflow_executions w where w.id=p_execution_id limit 1; end if;
 if p_workflow_id is not null then select workflow_name into workflow_name from public.ai_agent_workflows where id=p_workflow_id; end if;
 insert into public.ai_usage_events(run_id,request_id,client_id,service_scope,workflow,provider,model_name,input_tokens,output_tokens,total_tokens,estimated_cost_usd,metadata)
 values(p_execution_id,req,client,service_scope,coalesce(workflow_name,p_execution_type),'openai',p_model,p_input_tokens,p_output_tokens,coalesce(p_total_tokens,coalesce(p_input_tokens,0)+coalesce(p_output_tokens,0)),p_estimated_cost,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('duration_ms',p_duration_ms,'status',p_status,'agent_id',p_agent_id,'workflow_id',p_workflow_id)) returning id into x;
 return x;
end; $function$


CREATE OR REPLACE FUNCTION public.record_client_delivery_feedback(p_delivery_id uuid, p_status text, p_feedback jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare d public.ai_client_deliveries%rowtype; u uuid:=auth.uid(); role_name text;
begin
 select * into d from public.ai_client_deliveries where id=p_delivery_id for update;
 if not found then raise exception 'Client delivery not found'; end if;
 if not exists(select 1 from public.clients c join public.profiles p on p.id=u where c.id=d.client_id and c.profile_id=u) then raise exception 'Client access required'; end if;
 if p_status not in ('viewed','acknowledged','revision_requested','closed') then raise exception 'Invalid client delivery status'; end if;
 update public.ai_client_deliveries set delivery_status=p_status,client_feedback=coalesce(client_feedback,'{}'::jsonb)||coalesce(p_feedback,'{}'::jsonb),viewed_at=case when p_status in ('viewed','acknowledged','revision_requested','closed') then coalesce(viewed_at,now()) else viewed_at end,acknowledged_at=case when p_status in ('acknowledged','closed') then coalesce(acknowledged_at,now()) else acknowledged_at end,updated_at=now() where id=d.id;
 return jsonb_build_object('delivery_id',d.id,'status',p_status);
end; $function$


CREATE OR REPLACE FUNCTION public.record_client_service_outcome(p_client_id uuid, p_outcome_type text, p_outcome_title text, p_description text DEFAULT NULL::text, p_service_request_id uuid DEFAULT NULL::uuid, p_delivery_run_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'reported'::text, p_outcome_value jsonb DEFAULT '{}'::jsonb, p_source_type text DEFAULT 'client_report'::text, p_confidence numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if not (exists(select 1 from public.clients c join public.profiles p on p.id=u where c.id=p_client_id and c.profile_id=u) or role_name in ('admin','staff') or (role_name='coach' and p_service_request_id is not null and exists(select 1 from public.service_requests sr where sr.id=p_service_request_id and sr.assigned_coach=u))) then raise exception 'Authorized client or service team access required'; end if;
 if p_status not in ('reported','verified','achieved','in_progress','not_achieved','withdrawn') then raise exception 'Invalid outcome status'; end if;
 insert into public.client_service_outcomes(client_id,service_request_id,delivery_run_id,outcome_type,status,outcome_title,description,outcome_value,source_type,confidence,achieved_at,verified_by,verified_at)
 values(p_client_id,p_service_request_id,p_delivery_run_id,p_outcome_type,p_status,p_outcome_title,p_description,coalesce(p_outcome_value,'{}'::jsonb),p_source_type,p_confidence,case when p_status='achieved' then now() end,case when role_name in ('admin','staff') then u else null end,case when role_name in ('admin','staff') then now() else null end) returning id into v_id;
 insert into public.client_outcome_updates(outcome_id,client_id,update_type,new_status,note,created_by) values(v_id,p_client_id,'status_change',p_status,'Outcome recorded',u);
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.record_coach_agreement_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.required_agreements_accepted = true then
    insert into public.coach_agreement_acceptances (user_id, agreement_type, agreement_version, accepted_at)
    values (new.applicant_user_id, 'coach_marketplace_agreement', '1.0', coalesce(new.agreements_accepted_at, now()))
    on conflict (user_id, agreement_type, agreement_version) do nothing;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.record_coach_verification_decision(p_verification_record_id uuid, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_record public.coach_verification_records%rowtype; v_now timestamptz:=now();
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('staff','admin')) then raise exception 'Staff or admin authorization required'; end if;
 if p_decision not in ('approved','rejected','needs_more_evidence','expired','revoked') then raise exception 'Invalid decision'; end if;
 select * into v_record from public.coach_verification_records where id=p_verification_record_id for update;
 if not found then raise exception 'Verification record not found'; end if;
 update public.coach_verification_records set status=p_decision,reviewed_by=auth.uid(),reviewed_at=v_now,updated_at=v_now where id=p_verification_record_id;
 insert into public.coach_verification_decisions(verification_record_id,coach_id,decision,decision_reason,decided_by,decided_at) values(p_verification_record_id,v_record.coach_id,p_decision,p_reason,auth.uid(),v_now);
 perform public.check_coach_marketplace_activation_eligibility(v_record.coach_id);
 return jsonb_build_object('verification_record_id',p_verification_record_id,'coach_id',v_record.coach_id,'decision',p_decision,'decided_at',v_now);
end $function$


CREATE OR REPLACE FUNCTION public.refresh_ai_observability_daily(p_metric_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v jsonb;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized operations access required'; end if;
 insert into public.ai_observability_daily(metric_date,executions_total,executions_completed,executions_failed,executions_blocked,quality_evaluations,quality_failures,critical_quality_failures,human_reviews,revisions,outputs_generated,clients_impacted,improvement_signals,open_alerts,metric_data,refreshed_at)
 select p_metric_date,
   (select count(*) from public.ai_agent_executions where created_at::date=p_metric_date),
   (select count(*) from public.ai_agent_executions where created_at::date=p_metric_date and status='completed'),
   (select count(*) from public.ai_agent_executions where created_at::date=p_metric_date and status='failed'),
   (select count(*) from public.ai_agent_executions where created_at::date=p_metric_date and status='blocked'),
   (select count(*) from public.ai_workflow_quality_evaluations where created_at::date=p_metric_date),
   (select count(*) from public.ai_workflow_quality_evaluations where created_at::date=p_metric_date and passed=false),
   (select count(*) from public.ai_workflow_quality_evaluations where created_at::date=p_metric_date and passed=false and severity='critical'),
   (select count(*) from public.ai_workflow_reviews where created_at::date=p_metric_date),
   (select count(*) from public.ai_workflow_revision_requests where created_at::date=p_metric_date),
   (select count(*) from public.ai_output_versions where created_at::date=p_metric_date),
   (select count(distinct d.client_id) from public.ai_service_delivery_runs d where d.created_at::date=p_metric_date),
   (select count(*) from public.ai_improvement_signals where created_at::date=p_metric_date),
   (select count(*) from public.ai_operational_alerts where status='open'), '{}'::jsonb, now()
 on conflict(metric_date) do update set executions_total=excluded.executions_total,executions_completed=excluded.executions_completed,executions_failed=excluded.executions_failed,executions_blocked=excluded.executions_blocked,quality_evaluations=excluded.quality_evaluations,quality_failures=excluded.quality_failures,critical_quality_failures=excluded.critical_quality_failures,human_reviews=excluded.human_reviews,revisions=excluded.revisions,outputs_generated=excluded.outputs_generated,clients_impacted=excluded.clients_impacted,improvement_signals=excluded.improvement_signals,open_alerts=excluded.open_alerts,refreshed_at=now();
 select to_jsonb(d) into v from public.ai_observability_daily d where metric_date=p_metric_date;
 return v;
end; $function$


CREATE OR REPLACE FUNCTION public.register_ai_agent(p_agent_key text, p_name text, p_description text, p_category text DEFAULT 'other'::text, p_autonomy text DEFAULT 'human_approved'::text, p_owner_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active'; if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 if p_category not in ('career_intelligence','service_delivery','growth','sales','marketing','operations','research','governance','other') then raise exception 'Invalid category'; end if;
 if p_autonomy not in ('advisory','human_approved','bounded_automation','autonomous') then raise exception 'Invalid autonomy level'; end if;
 insert into public.ai_agent_registry(agent_key,name,description,agent_category,autonomy_level,human_approval_required,owner_role) values(p_agent_key,p_name,p_description,p_category,p_autonomy,p_autonomy<>'autonomous',p_owner_role) on conflict(agent_key) do update set name=excluded.name,description=excluded.description,agent_category=excluded.agent_category,autonomy_level=excluded.autonomy_level,human_approval_required=excluded.human_approval_required,owner_role=excluded.owner_role,updated_at=now() returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.register_ai_configuration(p_config_type text, p_config_key text, p_name text, p_description text DEFAULT NULL::text, p_owner_role text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; v_id uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff') then raise exception 'Admin or staff access required'; end if;
 if p_config_type not in ('prompt','model','workflow','quality_gate','service_blueprint','service_requirement','system','other') then raise exception 'Invalid configuration type'; end if;
 insert into public.ai_configuration_registry(config_type,config_key,name,description,owner_role) values(p_config_type,p_config_key,p_name,p_description,p_owner_role) on conflict(config_type,config_key) do update set name=excluded.name,description=excluded.description,owner_role=excluded.owner_role,updated_at=now() returning id into v_id;
 return v_id;
end; $function$


CREATE OR REPLACE FUNCTION public.register_marketplace_payment_webhook(p_provider_key text, p_provider_event_reference text, p_event_type text, p_payload jsonb, p_signature_verified boolean DEFAULT false, p_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(webhook_event_id uuid, is_duplicate boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_id uuid; begin if (select auth.uid()) is null then raise exception 'not_authenticated'; end if; if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin')) then raise exception 'not_authorized'; end if; if nullif(trim(p_provider_key),'') is null or nullif(trim(p_provider_event_reference),'') is null then raise exception 'provider_event_identity_required'; end if; insert into public.marketplace_payment_webhook_events(provider_key,provider_event_reference,event_type,payload,signature_verified,processing_status,transaction_id,received_at) values(p_provider_key,p_provider_event_reference,p_event_type,coalesce(p_payload,'{}'::jsonb),coalesce(p_signature_verified,false),case when coalesce(p_signature_verified,false) then 'verified' else 'received' end,p_transaction_id,now()) on conflict (provider_key,provider_event_reference) do nothing returning id into v_id; if v_id is not null then return query select v_id,false; else select id into v_id from public.marketplace_payment_webhook_events where provider_key=p_provider_key and provider_event_reference=p_provider_event_reference; return query select v_id,true; end if; end $function$


CREATE OR REPLACE FUNCTION public.request_ai_agent_execution(p_agent_key text, p_workflow_key text, p_trigger_source text, p_input_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=auth.uid();
 role_name text;
 a public.ai_agent_registry%rowtype;
 w public.ai_agent_workflows%rowtype;
 req uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach','client') then
   raise exception 'Authorized CareerDev Global access required';
 end if;
 select * into a from public.ai_agent_registry where agent_key=p_agent_key and active=true;
 if not found then raise exception 'Active AI agent not found'; end if;
 if a.owner_role in ('staff','admin') and role_name not in ('staff','admin') then
   raise exception 'This staff/admin agent is restricted to Staff/Admin access';
 end if;
 if a.owner_role='client_coach' and role_name in ('coach','client') and not exists (
   select 1 from public.ai_agent_subscriptions s
   join public.ai_agent_subscription_plans p on p.plan_key=s.plan_key
   where s.user_id=u and s.status in ('active','non_renewing','attention')
     and (s.current_period_end is null or s.current_period_end > now())
     and p.active=true and a.agent_key = any(p.included_agents)
 ) then raise exception 'An active CareerDev AI Agent subscription is required for this agent'; end if;
 if p_workflow_key is not null then
   select * into w from public.ai_agent_workflows where agent_id=a.id and workflow_key=p_workflow_key and active=true order by version desc limit 1;
   if not found then raise exception 'Active workflow not found for agent'; end if;
 end if;
 insert into public.ai_agent_execution_requests(agent_id,workflow_id,requested_by,trigger_source,input_payload,status,authorized_at)
 values(a.id,case when w.id is null then null else w.id end,u,p_trigger_source,coalesce(p_input_payload,'{}'::jsonb),'authorized',now())
 returning id into req;
 insert into public.ai_agent_execution_events(request_id,event_type,event_data,actor_id)
 values(req,'requested',jsonb_build_object('agent_key',a.agent_key,'workflow_key',p_workflow_key),u),
       (req,'authorized',jsonb_build_object('autonomy_level',a.autonomy_level,'human_approval_required',a.human_approval_required),u);
 return req;
end;
$function$


CREATE OR REPLACE FUNCTION public.request_ai_human_approval(p_request_id uuid, p_execution_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid := auth.uid(); id_out uuid;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id=u and p.status='active' and p.role in ('admin','staff','coach')) then
    raise exception 'Authorized operations access required';
  end if;
  if not exists (select 1 from public.ai_agent_execution_requests r where r.id=p_request_id and (r.requested_by=u or exists(select 1 from public.profiles p where p.id=u and p.role in ('admin','staff')))) then
    raise exception 'Execution request not accessible';
  end if;
  insert into public.ai_human_approval_requests(request_id,execution_id,requested_by)
  values(p_request_id,p_execution_id,u)
  on conflict (request_id) do update set execution_id=excluded.execution_id, status='pending', approved_by=null, approved_at=null, decision_notes=null;
  select id into id_out from public.ai_human_approval_requests where request_id=p_request_id;
  return id_out;
end;
$function$


CREATE OR REPLACE FUNCTION public.request_human_coach_review(p_title text, p_original_request text, p_objective text, p_target_role text DEFAULT NULL::text, p_target_organization text DEFAULT NULL::text, p_target_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v_user uuid := auth.uid(); v_plan text; v_limit integer; v_used integer; v_start date := date_trunc('month', now())::date; v_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date; v_request_id uuid; begin if v_user is null then raise exception 'Authentication required'; end if; perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':human_coach_review:' || v_start::text,0)); select s.plan_key into v_plan from public.ai_agent_subscriptions s where s.user_id=v_user and s.status in ('active','non_renewing','attention') and s.current_period_end > now() order by s.current_period_end desc limit 1; if v_plan is null then raise exception 'An active subscription is required'; end if; select e.monthly_quantity into v_limit from public.ai_plan_service_entitlements e where e.plan_key=v_plan and e.feature_key='human_coach_review' and e.enabled=true and e.availability_status='available'; if v_limit is null then raise exception 'Human Coach Review is not included in your plan'; end if; select coalesce(sum(quantity),0) into v_used from public.ai_plan_service_usage where user_id=v_user and feature_key='human_coach_review' and period_start=v_start and period_end=v_end; if v_used >= v_limit then raise exception 'Your monthly Human Coach Review allowance has been used'; end if; insert into public.service_requests(client_id,title,original_request,objective,target_role,target_organization,target_country,priority,status,created_at,updated_at) values(v_user,p_title,p_original_request,p_objective,p_target_role,p_target_organization,p_target_country,'standard','pending',now(),now()) returning id into v_request_id; insert into public.ai_plan_service_usage(user_id,feature_key,period_start,period_end,quantity,service_request_id) values(v_user,'human_coach_review',v_start,v_end,1,v_request_id); return jsonb_build_object('allowed',true,'request_id',v_request_id,'plan_key',v_plan,'monthly_limit',v_limit,'used',v_used+1,'remaining',v_limit-v_used-1); end; $function$


CREATE OR REPLACE FUNCTION public.request_marketplace_refund(p_transaction_id uuid, p_amount numeric, p_reason text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_client uuid; v_currency text; v_gross numeric; v_paid numeric; v_existing numeric;
begin
 select client_id,currency,gross_amount into v_client,v_currency,v_gross from public.marketplace_transactions where id=p_transaction_id;
 if not found then raise exception 'transaction_not_found'; end if;
 if (select auth.uid()) is null or (select auth.uid()) <> v_client then raise exception 'not_authorized'; end if;
 if p_amount <= 0 or p_amount > v_gross then raise exception 'invalid_refund_amount'; end if;
 select coalesce(sum(amount),0) into v_existing from public.marketplace_refunds where transaction_id=p_transaction_id and status not in ('rejected','cancelled','failed');
 if v_existing + p_amount > v_gross then raise exception 'refund_exceeds_transaction'; end if;
 insert into public.marketplace_refunds(transaction_id,requested_by,amount,currency,reason,status,idempotency_key)
 values(p_transaction_id,(select auth.uid()),p_amount,v_currency,p_reason,'requested',p_idempotency_key) returning id into v_id;
 insert into public.marketplace_refund_events(refund_id,event_type,actor_type,actor_id,event_data) values(v_id,'requested','client',(select auth.uid()),jsonb_build_object('amount',p_amount,'reason',p_reason));
 update public.marketplace_transactions set release_eligibility='blocked',updated_at=now() where id=p_transaction_id and release_eligibility not in ('released');
 return v_id;
end $function$


CREATE OR REPLACE FUNCTION public.reserve_ai_credits(p_operation_key text, p_execution_id uuid DEFAULT NULL::uuid, p_request_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(allowed boolean, reason text, ledger_id uuid, credits_required integer, credits_remaining integer, monthly_allowance integer, credits_consumed integer, credits_reserved integer, period_start timestamp with time zone, period_end timestamp with time zone, plan_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_role text;
  v_sub public.ai_agent_subscriptions%rowtype;
  v_plan public.ai_agent_subscription_plans%rowtype;
  v_op public.ai_credit_operations%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_consumed integer := 0;
  v_reserved integer := 0;
  v_existing public.ai_credit_ledger%rowtype;
  v_ledger_id uuid;
  v_key text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select p.role into v_role from public.profiles p where p.id=v_user_id;
  if v_role in ('admin','staff') then
    return query select true,'internal_staff_usage_no_customer_credit',null::uuid,0,0,0,0,0,now(),now(),null::text; return;
  end if;
  select o.* into v_op from public.ai_credit_operations o where o.operation_key=p_operation_key and o.active=true;
  if not found then raise exception 'Unknown or inactive AI credit operation: %',p_operation_key; end if;
  v_key:=coalesce(nullif(trim(p_idempotency_key),''),coalesce(p_execution_id::text,p_request_id::text,p_operation_key||':'||clock_timestamp()::text));
  select l.* into v_existing from public.ai_credit_ledger l where l.user_id=v_user_id and l.idempotency_key=v_key limit 1;
  if found then
    select coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0),coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0)
      into v_consumed,v_reserved from public.ai_credit_ledger l where l.user_id=v_user_id and l.period_start=v_existing.period_start and l.period_end=v_existing.period_end;
    select p.monthly_credits into v_plan.monthly_credits from public.ai_agent_subscription_plans p where p.plan_key=v_existing.plan_key;
    return query select true,'idempotent_existing_request',v_existing.id,v_existing.credits,greatest(v_plan.monthly_credits-v_consumed-v_reserved,0),v_plan.monthly_credits,v_consumed,v_reserved,v_existing.period_start,v_existing.period_end,v_existing.plan_key; return;
  end if;
  select s.* into v_sub from public.ai_agent_subscriptions s where s.user_id=v_user_id and s.status in ('active','non_renewing') order by s.updated_at desc limit 1 for update;
  if not found then return query select false,'no_active_ai_subscription',null::uuid,0,0,0,0,0,now(),now(),null::text; return; end if;
  select p.* into v_plan from public.ai_agent_subscription_plans p where p.plan_key=v_sub.plan_key and p.active=true;
  if not found then return query select false,'subscription_plan_unavailable',null::uuid,0,0,0,0,0,now(),now(),v_sub.plan_key; return; end if;
  v_period_start:=date_trunc('month',coalesce(v_sub.current_period_start,now()));
  if v_period_start>now() then v_period_start:=date_trunc('month',now()); end if;
  while v_period_start+interval '1 month'<=now() loop v_period_start:=v_period_start+interval '1 month'; end loop;
  v_period_end:=v_period_start+interval '1 month';
  select coalesce(sum(case when l.status='consumed' then l.credits else 0 end),0),coalesce(sum(case when l.status='reserved' then l.credits else 0 end),0)
    into v_consumed,v_reserved from public.ai_credit_ledger l where l.user_id=v_user_id and l.period_start=v_period_start and l.period_end=v_period_end;
  if v_op.credit_cost=0 then
    return query select true,'no_customer_credit_required',null::uuid,0,greatest(v_plan.monthly_credits-v_consumed-v_reserved,0),v_plan.monthly_credits,v_consumed,v_reserved,v_period_start,v_period_end,v_sub.plan_key; return;
  end if;
  if v_consumed+v_reserved+v_op.credit_cost>v_plan.monthly_credits then
    return query select false,'insufficient_ai_credits',null::uuid,v_op.credit_cost,greatest(v_plan.monthly_credits-v_consumed-v_reserved,0),v_plan.monthly_credits,v_consumed,v_reserved,v_period_start,v_period_end,v_sub.plan_key; return;
  end if;
  insert into public.ai_credit_ledger(user_id,subscription_id,plan_key,period_start,period_end,operation_key,agent_key,execution_id,request_id,credits,status,idempotency_key,metadata)
  values(v_user_id,v_sub.id,v_sub.plan_key,v_period_start,v_period_end,v_op.operation_key,v_op.agent_key,p_execution_id,p_request_id,v_op.credit_cost,'reserved',v_key,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_ledger_id;
  return query select true,'credits_reserved',v_ledger_id,v_op.credit_cost,v_plan.monthly_credits-v_consumed-v_reserved-v_op.credit_cost,v_plan.monthly_credits,v_consumed,v_reserved+v_op.credit_cost,v_period_start,v_period_end,v_sub.plan_key;
end;
$function$


CREATE OR REPLACE FUNCTION public.reset_career_intelligence_workspace(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_client uuid;
  v_status text;
  v_paths text[];
  v_deleted_documents integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select sr.client_id, sr.status
    into v_client, v_status
  from public.service_requests sr
  join public.clients c on c.id = sr.client_id
  where sr.id = p_request_id
    and c.profile_id = v_user
  for update;

  if v_client is null then
    raise exception 'Career Intelligence request not found';
  end if;

  if v_status not in ('new','awaiting_client','awaiting_review') then
    raise exception 'This Career Intelligence request can no longer be reset because it is already in active delivery or another protected state';
  end if;

  select coalesce(array_agg(d.storage_path) filter (where d.storage_path is not null), array[]::text[])
    into v_paths
  from public.documents d
  where d.request_id = p_request_id
    and d.client_id = v_client;

  if coalesce(array_length(v_paths,1),0) > 0 then
    delete from storage.objects
    where bucket_id = 'client-documents'
      and name = any(v_paths);
  end if;

  delete from public.service_requests where id = p_request_id;

  get diagnostics v_deleted_documents = row_count;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'deleted_documents', coalesce(array_length(v_paths,1),0),
    'message', 'Career Intelligence workspace reset successfully'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.review_intake_evidence_proposal(p_proposal_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare x record; v_review uuid; v_evidence uuid; v_status text;
begin
 if p_decision not in('approved','rejected','needs_clarification') then raise exception 'Invalid review decision'; end if;
 select * into x from public.dynamic_intake_evidence_proposals where id=p_proposal_id;
 if x.id is null then raise exception 'Evidence proposal not found'; end if;
 if not exists(select 1 from public.profiles pr where pr.id=(select auth.uid()) and pr.role in('admin','staff','coach')) then raise exception 'Reviewer role required'; end if;
 if x.evidence_item_id is null then select (public.bridge_intake_proposal_to_evidence(x.id)->>'evidence_item_id')::uuid into v_evidence; else v_evidence:=x.evidence_item_id; end if;
 insert into public.evidence_reviews(evidence_item_id,reviewer_id,decision,notes) values(v_evidence,(select auth.uid()),p_decision,p_notes) returning id into v_review;
 v_status:=case p_decision when 'approved' then 'verified' when 'rejected' then 'rejected' else 'needs_clarification' end;
 update public.dynamic_intake_evidence_proposals set verification_status=v_status,status=case when p_decision='approved' then 'approved' when p_decision='rejected' then 'rejected' else 'needs_clarification' end,updated_at=now() where id=x.id;
 return jsonb_build_object('proposal_id',x.id,'evidence_item_id',v_evidence,'review_id',v_review,'decision',p_decision,'verification_status',v_status,'profile_sync_allowed',p_decision='approved');
end; $function$


CREATE OR REPLACE FUNCTION public.run_ai_production_safety_gate()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 u uuid:=auth.uid(); role_name text; total_agents int; eligible int; blocking jsonb;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff') then raise exception 'Admin/Staff access required'; end if;
 select count(*) into total_agents from public.ai_agent_registry where owner_role='client_coach' and active=true;
 select count(*) into eligible from public.ai_agent_certifications c
 join public.ai_agent_registry a on a.id=c.agent_id
 where a.owner_role='client_coach' and a.active=true
 and c.security_verified and c.configuration_verified and c.workflow_verified
 and c.output_schema_verified and c.human_approval_verified and c.audit_verified
 and c.quality_suite_verified and c.safety_gate_verified and c.e2e_verified;
 select coalesce(jsonb_agg(jsonb_build_object(
   'agent_key',a.agent_key,'status',c.certification_status,
   'missing',jsonb_build_array(
      case when not c.security_verified then 'security' end,
      case when not c.configuration_verified then 'configuration' end,
      case when not c.workflow_verified then 'workflow' end,
      case when not c.output_schema_verified then 'output_schema' end,
      case when not c.human_approval_verified then 'human_approval' end,
      case when not c.audit_verified then 'audit' end,
      case when not c.quality_suite_verified then 'quality_suite' end,
      case when not c.safety_gate_verified then 'safety_gate' end,
      case when not c.e2e_verified then 'e2e' end
   )
 )), '[]'::jsonb) into blocking
 from public.ai_agent_registry a
 join public.ai_agent_certifications c on c.agent_id=a.id
 where a.owner_role='client_coach' and a.active=true
 and not (c.security_verified and c.configuration_verified and c.workflow_verified
   and c.output_schema_verified and c.human_approval_verified and c.audit_verified
   and c.quality_suite_verified and c.safety_gate_verified and c.e2e_verified);
 return jsonb_build_object('decision',case when total_agents=16 and eligible=total_agents then 'PASS' else 'BLOCKED' end,
 'total_agents',total_agents,'eligible_agents',eligible,'blocking_agents',blocking,
 'rule','No Client/Coach AI agent may be released Live until every certification gate passes.');
end;
$function$


CREATE OR REPLACE FUNCTION public.run_career_profile_quality_check(p_client_id uuid, p_profile_id uuid, p_trigger_type text DEFAULT 'manual'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_run_id uuid; v_health numeric:=1.0; v_issue_count integer:=0; v_critical integer:=0; v_profile record; v_has_verified_evidence boolean:=false; v_has_open_conflict boolean:=false; begin
if not exists(select 1 from public.clients c where c.id=p_client_id and c.profile_id=(select auth.uid())) and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('admin','staff','coach')) then raise exception 'Not authorized'; end if;
select * into v_profile from public.career_profiles where id=p_profile_id and client_id=p_client_id and is_current=true; if not found then raise exception 'Current career profile not found'; end if;
insert into public.career_profile_quality_runs(client_id,career_profile_id,profile_version,trigger_type,created_by) values(p_client_id,p_profile_id,coalesce(v_profile.profile_version,v_profile.version),p_trigger_type,(select auth.uid())) returning id into v_run_id;
if nullif(trim(coalesce(v_profile.target_role,'')),'') is null and coalesce(array_length(v_profile.target_roles,1),0)=0 then insert into public.career_profile_quality_issues(run_id,client_id,career_profile_id,issue_type,severity,field_name,description,confidence) values(v_run_id,p_client_id,p_profile_id,'missing_information','high','target_role','No target career role is currently defined.',1); end if;
if nullif(trim(coalesce(v_profile.professional_summary,'')),'') is null then insert into public.career_profile_quality_issues(run_id,client_id,career_profile_id,issue_type,severity,field_name,description,confidence) values(v_run_id,p_client_id,p_profile_id,'missing_information','medium','professional_summary','Professional summary is missing.',1); end if;
select exists(select 1 from public.evidence_items e where e.client_id=p_client_id and e.verification_status='verified') into v_has_verified_evidence; if not v_has_verified_evidence then insert into public.career_profile_quality_issues(run_id,client_id,career_profile_id,issue_type,severity,field_name,description,confidence) values(v_run_id,p_client_id,p_profile_id,'evidence_mismatch','high',null,'Profile has no verified evidence supporting its current information.',1); end if;
select exists(select 1 from public.document_facts f where f.client_id=p_client_id and f.verification_status in ('needs_clarification','rejected') and f.conflict_group is not null) into v_has_open_conflict; if v_has_open_conflict then insert into public.career_profile_quality_issues(run_id,client_id,career_profile_id,issue_type,severity,field_name,description,confidence) values(v_run_id,p_client_id,p_profile_id,'conflict','critical',null,'One or more unresolved document evidence conflicts may affect profile reliability.',1); end if;
if coalesce(array_length(v_profile.target_roles,1),0)>1 and (select count(*) from unnest(v_profile.target_roles) x)<>(select count(distinct lower(trim(x))) from unnest(v_profile.target_roles) x) then insert into public.career_profile_quality_issues(run_id,client_id,career_profile_id,issue_type,severity,field_name,description,confidence) values(v_run_id,p_client_id,p_profile_id,'duplicate','low','target_roles','Duplicate target roles detected.',1); end if;
select count(*) into v_issue_count from public.career_profile_quality_issues where run_id=v_run_id; select count(*) into v_critical from public.career_profile_quality_issues where run_id=v_run_id and severity='critical'; v_health:=greatest(0,1-least(1,(v_issue_count*0.10)+(v_critical*0.35)));
update public.career_profile_quality_runs set issue_count=v_issue_count,critical_issue_count=v_critical,health_score=v_health,status=case when v_critical>0 then 'needs_review' when v_issue_count>0 then 'needs_review' else 'passed' end,summary=case when v_issue_count=0 then 'No quality issues detected by the current rule set.' else v_issue_count||' profile quality issue(s) detected; human review may be required.' end,completed_at=now() where id=v_run_id; return v_run_id; end; $function$


CREATE OR REPLACE FUNCTION public.run_marketplace_automation_cycle(p_reminder_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_run uuid; v_reminders integer:=0;
begin
 insert into public.marketplace_scheduler_runs(job_name,metadata) values('marketplace_automation_cycle',jsonb_build_object('reminder_limit',p_reminder_limit)) returning id into v_run;
 v_reminders:=public.process_due_marketplace_reminders(greatest(coalesce(p_reminder_limit,100),1));
 update public.marketplace_scheduler_runs set finished_at=now(),status='completed',processed_count=v_reminders where id=v_run;
 return jsonb_build_object('run_id',v_run,'status','completed','reminders_processed',v_reminders);
exception when others then
 update public.marketplace_scheduler_runs set finished_at=now(),status='failed',error_message=sqlerrm where id=v_run; raise;
end; $function$


CREATE OR REPLACE FUNCTION public.run_marketplace_financial_audit(p_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t record; n integer:=0; refund_total numeric; payout_total numeric; rec_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and role in ('staff','admin')) then raise exception 'Staff or admin access required'; end if;
 for t in select * from public.marketplace_transactions where p_transaction_id is null or id=p_transaction_id loop
   select coalesce(sum(amount),0) into refund_total from public.marketplace_refunds where transaction_id=t.id and status in ('requested','under_review','approved','processing','completed','partially_completed');
   select coalesce(sum(payout_amount),0) into payout_total from public.marketplace_payouts where transaction_id=t.id and status not in ('cancelled','failed');
   select coalesce((select reconciliation_status from public.marketplace_payment_reconciliation where transaction_id=t.id order by created_at desc limit 1),'pending') into rec_status;
   if abs((t.platform_fee+t.coach_earnings)-t.gross_amount) > 0.01 then
     insert into public.marketplace_financial_audit_exceptions(transaction_id,exception_type,severity,description) values(t.id,'split_mismatch','critical','Platform fee plus coach earnings does not equal gross transaction amount.'); n:=n+1;
   end if;
   if abs((t.platform_share_pct+t.coach_share_pct)-100) > 0.01 then
     insert into public.marketplace_financial_audit_exceptions(transaction_id,exception_type,severity,description) values(t.id,'split_mismatch','critical','Platform and coach share percentages do not total 100%.'); n:=n+1;
   end if;
   if refund_total > t.gross_amount then
     insert into public.marketplace_financial_audit_exceptions(transaction_id,exception_type,severity,description) values(t.id,'refund_exposure','high','Refund exposure exceeds gross transaction amount.'); n:=n+1;
   end if;
   if payout_total > t.coach_earnings then
     insert into public.marketplace_financial_audit_exceptions(transaction_id,exception_type,severity,description) values(t.id,'payout_exposure','critical','Payout exposure exceeds coach entitlement.'); n:=n+1;
   end if;
   if rec_status not in ('matched','resolved','ignored') then
     insert into public.marketplace_financial_audit_exceptions(transaction_id,exception_type,severity,description) values(t.id,'reconciliation_mismatch','high','Payment reconciliation is not cleared.'); n:=n+1;
   end if;
 end loop;
 return n;
end; $function$


CREATE OR REPLACE FUNCTION public.run_marketplace_financial_operations_alert_cycle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_now timestamptz:=now(); v_resolved integer:=0; begin insert into public.marketplace_financial_operations_alerts(alert_key,alert_type,severity,title,description,observed_value,metadata) select 'reconciliation_attention','reconciliation','high','Payment reconciliation requires attention','One or more payment reconciliation records are unmatched or mismatched.',count(*)::numeric,jsonb_build_object('source','marketplace_payment_reconciliation') from public.marketplace_payment_reconciliation where reconciliation_status in ('unmatched','mismatch') having count(*)>0 on conflict(alert_key) do update set status='open',last_detected_at=v_now,resolved_at=null,updated_at=v_now,observed_value=excluded.observed_value; insert into public.marketplace_financial_operations_alerts(alert_key,alert_type,severity,title,description,observed_value,metadata) select 'critical_financial_exceptions','financial_exception','critical','Critical financial exceptions detected','Critical marketplace financial audit exceptions remain open.',count(*)::numeric,jsonb_build_object('source','marketplace_financial_audit_exceptions') from public.marketplace_financial_audit_exceptions where status in ('open','under_review') and severity='critical' having count(*)>0 on conflict(alert_key) do update set status='open',last_detected_at=v_now,resolved_at=null,updated_at=v_now,observed_value=excluded.observed_value; insert into public.marketplace_financial_operations_alerts(alert_key,alert_type,severity,title,description,observed_value,metadata) select 'blocked_payouts','payout','high','Payouts are blocked','One or more payouts failed the financial release-control checks.',count(*)::numeric,jsonb_build_object('source','marketplace_payouts') from public.marketplace_payouts where release_check_status='blocked' having count(*)>0 on conflict(alert_key) do update set status='open',last_detected_at=v_now,resolved_at=null,updated_at=v_now,observed_value=excluded.observed_value; insert into public.marketplace_financial_operations_alerts(alert_key,alert_type,severity,title,description,observed_value,metadata) select 'failed_payment_webhooks','webhook','high','Payment webhook failures detected','Payment provider webhook events require operational attention.',count(*)::numeric,jsonb_build_object('source','marketplace_payment_webhook_events') from public.marketplace_payment_webhook_events where processing_status='failed' having count(*)>0 on conflict(alert_key) do update set status='open',last_detected_at=v_now,resolved_at=null,updated_at=v_now,observed_value=excluded.observed_value; insert into public.marketplace_financial_operations_alerts(alert_key,alert_type,severity,title,description,observed_value,metadata) select 'open_marketplace_disputes','dispute','medium','Open marketplace disputes','One or more marketplace disputes require review or resolution.',count(*)::numeric,jsonb_build_object('source','marketplace_disputes') from public.marketplace_disputes where status in ('open','under_review','awaiting_response','escalated') having count(*)>0 on conflict(alert_key) do update set status='open',last_detected_at=v_now,resolved_at=null,updated_at=v_now,observed_value=excluded.observed_value; update public.marketplace_financial_operations_alerts a set status='resolved',resolved_at=v_now,updated_at=v_now where a.status in ('open','acknowledged') and ((a.alert_key='reconciliation_attention' and not exists(select 1 from public.marketplace_payment_reconciliation where reconciliation_status in ('unmatched','mismatch'))) or (a.alert_key='critical_financial_exceptions' and not exists(select 1 from public.marketplace_financial_audit_exceptions where status in ('open','under_review') and severity='critical')) or (a.alert_key='blocked_payouts' and not exists(select 1 from public.marketplace_payouts where release_check_status='blocked')) or (a.alert_key='failed_payment_webhooks' and not exists(select 1 from public.marketplace_payment_webhook_events where processing_status='failed')) or (a.alert_key='open_marketplace_disputes' and not exists(select 1 from public.marketplace_disputes where status in ('open','under_review','awaiting_response','escalated')))); get diagnostics v_resolved=row_count; return jsonb_build_object('open_alerts',(select count(*) from public.marketplace_financial_operations_alerts where status in ('open','acknowledged')),'resolved_alerts',v_resolved,'evaluated_at',v_now); end; $function$


CREATE OR REPLACE FUNCTION public.save_career_intake_response(p_question_id uuid, p_request_id uuid, p_response_text text, p_response_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_user uuid := auth.uid(); v_client uuid; v_q record; v_id uuid; begin if v_user is null then raise exception 'Authentication required'; end if; select c.id into v_client from public.clients c where c.profile_id=v_user; if v_client is null then raise exception 'Client profile not found'; end if; select q.id,q.request_id,q.required,q.question_text,q.status into v_q from public.intake_questions q where q.id=p_question_id and q.request_id=p_request_id; if v_q.id is null then raise exception 'Question not found for this request'; end if; if not exists(select 1 from public.service_requests r where r.id=p_request_id and r.client_id=v_client) then raise exception 'Request does not belong to the current client'; end if; if v_q.required and nullif(trim(coalesce(p_response_text,'')),'') is null then raise exception 'Please provide an answer before continuing'; end if; insert into public.intake_responses(question_id,request_id,client_id,response_text,response_data,source,confidence,verification_status,answered_at,updated_at) values(v_q.id,p_request_id,v_client,p_response_text,coalesce(p_response_data,jsonb_build_object('text',p_response_text)),'client',1,'unverified',now(),now()) on conflict(question_id) do update set response_text=excluded.response_text,response_data=excluded.response_data,source='client',confidence=1,verification_status='unverified',answered_at=now(),updated_at=now() returning id into v_id; update public.intake_questions set status='answered',updated_at=now() where id=v_q.id; if v_q.question_text ilike '%CV target%' or v_q.question_text ilike '%role, industry, or career direction%' then update public.service_requests set target_role=nullif(trim(p_response_text),''),updated_at=now() where id=p_request_id; end if; return jsonb_build_object('success',true,'response_id',v_id,'question_id',v_q.id,'request_id',p_request_id); end; $function$


CREATE OR REPLACE FUNCTION public.save_career_pasted_information(p_request_id uuid, p_pasted_information text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_client uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_pasted_information),'') is null then raise exception 'Please paste your CV or career information first'; end if;
 select sr.client_id into v_client
 from public.service_requests sr join public.clients c on c.id=sr.client_id
 where sr.id=p_request_id and c.profile_id=v_user
 for update;
 if v_client is null then raise exception 'Career Intelligence request not found'; end if;
 update public.service_requests
 set special_instructions=trim(coalesce(special_instructions,'') || case when nullif(trim(special_instructions),'') is null then '' else E'\n\n' end || '[CLIENT-PASTED CAREER INFORMATION]\n' || trim(p_pasted_information)),
     updated_at=now()
 where id=p_request_id;
 return jsonb_build_object('success',true,'request_id',p_request_id,'message','Pasted career information saved securely.');
end;
$function$


CREATE OR REPLACE FUNCTION public.schedule_marketplace_booking_reminders(p_booking_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  b record;
  v_count integer := 0;
  v_start timestamptz;
  v_key text;
begin
  select * into b from public.marketplace_booking_requests where id = p_booking_id;
  if not found then raise exception 'booking not found'; end if;
  if b.booking_status not in ('requested','confirmed') then return 0; end if;
  v_start := b.requested_start;
  if v_start is null then return 0; end if;

  if v_start > now() + interval '24 hours' then
    v_key := p_booking_id::text || ':session_24h';
    insert into public.marketplace_notification_schedules(booking_id,client_id,coach_id,reminder_type,scheduled_for,dedupe_key,metadata)
    values(p_booking_id,b.client_id,b.coach_id,'session_24h',v_start-interval '24 hours',v_key,jsonb_build_object('timezone',b.timezone))
    on conflict(dedupe_key) do nothing;
    v_count := v_count + 1;
  end if;

  if v_start > now() + interval '1 hour' then
    v_key := p_booking_id::text || ':session_1h';
    insert into public.marketplace_notification_schedules(booking_id,client_id,coach_id,reminder_type,scheduled_for,dedupe_key,metadata)
    values(p_booking_id,b.client_id,b.coach_id,'session_1h',v_start-interval '1 hour',v_key,jsonb_build_object('timezone',b.timezone))
    on conflict(dedupe_key) do nothing;
    v_count := v_count + 1;
  end if;

  v_key := p_booking_id::text || ':session_start';
  insert into public.marketplace_notification_schedules(booking_id,client_id,coach_id,reminder_type,scheduled_for,dedupe_key,metadata)
  values(p_booking_id,b.client_id,b.coach_id,'session_start',v_start,v_key,jsonb_build_object('timezone',b.timezone))
  on conflict(dedupe_key) do nothing;
  v_count := v_count + 1;
  return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.score_coach_match_candidates(p_service_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ declare v_request public.service_requests%rowtype; v_pref public.coach_matching_preferences%rowtype; v_row record; v_score numeric; v_reasons text[]; v_flags text[]; v_total integer:=0; begin select * into v_request from public.service_requests where id=p_service_request_id; if v_request.id is null then raise exception 'Service request not found'; end if; if not exists(select 1 from public.profiles p join public.clients c on c.profile_id=p.id where c.id=v_request.client_id and p.id=(select auth.uid())) and not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin')) then raise exception 'Not authorized'; end if; select * into v_pref from public.coach_matching_preferences where service_request_id=p_service_request_id; for v_row in select r.id,r.coach_id,cmp.specializations,cmp.coaching_formats,cmp.languages,cmp.timezone,cmp.country,cmp.years_coaching,coalesce(avg(mr.rating),0) rating from public.coach_match_results r join public.coach_marketplace_profiles cmp on cmp.coach_id=r.coach_id left join public.marketplace_reviews mr on mr.coach_id=r.coach_id and mr.status='published' where r.service_request_id=p_service_request_id group by r.id,r.coach_id,cmp.specializations,cmp.coaching_formats,cmp.languages,cmp.timezone,cmp.country,cmp.years_coaching loop v_score:=0;v_reasons:='{}';v_flags:='{}'; if v_request.target_role is not null and exists(select 1 from unnest(v_row.specializations) s where lower(s) like '%'||lower(v_request.target_role)||'%') then v_score:=v_score+30;v_reasons:=array_append(v_reasons,'Specialization aligns with target role');end if; if v_pref.id is not null and cardinality(v_pref.specialization_requirements)>0 and v_row.specializations && v_pref.specialization_requirements then v_score:=v_score+25;v_reasons:=array_append(v_reasons,'Requested specialization match');end if; if v_pref.id is not null and cardinality(v_pref.preferred_languages)>0 and v_row.languages && v_pref.preferred_languages then v_score:=v_score+10;v_reasons:=array_append(v_reasons,'Language preference match');end if; if v_pref.id is not null and cardinality(v_pref.preferred_coaching_formats)>0 and v_row.coaching_formats && v_pref.preferred_coaching_formats then v_score:=v_score+10;v_reasons:=array_append(v_reasons,'Coaching format match');end if; if v_pref.id is not null and cardinality(v_pref.preferred_countries)>0 and v_row.country=any(v_pref.preferred_countries) then v_score:=v_score+5;v_reasons:=array_append(v_reasons,'Country preference match');end if; if v_pref.id is not null and cardinality(v_pref.preferred_timezones)>0 and v_row.timezone=any(v_pref.preferred_timezones) then v_score:=v_score+5;v_reasons:=array_append(v_reasons,'Timezone preference match');end if; if v_pref.id is not null and v_pref.minimum_years_coaching is not null and coalesce(v_row.years_coaching,0)<v_pref.minimum_years_coaching then v_flags:=array_append(v_flags,'Below requested coaching experience');end if; if v_pref.id is not null and v_pref.minimum_rating is not null and v_row.rating<v_pref.minimum_rating then v_flags:=array_append(v_flags,'Below requested rating');end if; v_score:=least(100,v_score+least(15,v_row.rating*3)); update public.coach_match_results set score=v_score,score_breakdown=jsonb_build_object('rating_bonus',least(15,v_row.rating*3),'reason_count',cardinality(v_reasons)),match_reasons=v_reasons,mismatch_flags=v_flags,updated_at=now() where id=v_row.id; end loop; update public.coach_match_results r set rank=x.rank,match_status=case when x.rank<=5 and cardinality(r.mismatch_flags)=0 then 'recommended' else 'candidate' end from(select id,row_number() over(order by score desc,id) rank from public.coach_match_results where service_request_id=p_service_request_id)x where r.id=x.id;select count(*) into v_total from public.coach_match_results where service_request_id=p_service_request_id;return jsonb_build_object('service_request_id',p_service_request_id,'scored_candidates',v_total);end; $function$


CREATE OR REPLACE FUNCTION public.score_coach_match_candidates(p_service_request_id uuid, p_query_embedding vector, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select public.generate_coach_match_candidates(p_service_request_id,p_query_embedding,p_limit); $function$


CREATE OR REPLACE FUNCTION public.search_marketplace_coaches(p_service_id uuid DEFAULT NULL::uuid, p_specializations text[] DEFAULT NULL::text[], p_languages text[] DEFAULT NULL::text[], p_formats text[] DEFAULT NULL::text[], p_country text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_max_price numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text, p_min_rating numeric DEFAULT NULL::numeric, p_min_years integer DEFAULT NULL::integer, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(coach_id uuid, marketplace_profile_id uuid, display_name text, headline text, bio text, specializations text[], coaching_formats text[], languages text[], timezone text, country text, years_coaching integer, verification_status text, marketplace_status text, profile_completion_pct integer, average_rating numeric, review_count integer, minimum_price numeric, currencies text[], delivery_modes text[])
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select d.coach_id,d.marketplace_profile_id,d.display_name,d.headline,d.bio,d.specializations,d.coaching_formats,d.languages,d.timezone,d.country,d.years_coaching,d.verification_status,d.marketplace_status,d.profile_completion_pct,d.average_rating,d.review_count,d.minimum_price,d.currencies,d.delivery_modes
  from public.marketplace_coach_discovery d
  where (p_service_id is null or exists(select 1 from public.coach_service_offerings s where s.coach_id=d.coach_id and s.service_id=p_service_id and s.active=true and s.price is not null and s.price>0))
    and (p_specializations is null or cardinality(p_specializations)=0 or d.specializations && p_specializations)
    and (p_languages is null or cardinality(p_languages)=0 or d.languages && p_languages)
    and (p_formats is null or cardinality(p_formats)=0 or d.coaching_formats && p_formats)
    and (p_country is null or lower(d.country)=lower(p_country))
    and (p_timezone is null or d.timezone=p_timezone)
    and (p_max_price is null or (p_currency is not null and exists(select 1 from public.coach_service_offerings s where s.coach_id=d.coach_id and s.active=true and s.currency=p_currency and s.price is not null and s.price<=p_max_price)))
    and (p_min_rating is null or d.average_rating>=p_min_rating)
    and (p_min_years is null or coalesce(d.years_coaching,0)>=p_min_years)
    and (p_query is null or lower(coalesce(d.display_name,'')||' '||coalesce(d.headline,'')||' '||coalesce(d.bio,'')||' '||array_to_string(d.specializations,' ')) like '%'||lower(p_query)||'%')
  order by d.average_rating desc,d.review_count desc,coalesce(d.years_coaching,0) desc,d.display_name asc
  limit greatest(1,least(coalesce(p_limit,20),100)) offset greatest(0,coalesce(p_offset,0));
$function$


CREATE OR REPLACE FUNCTION public.select_next_dynamic_intake_question(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_client uuid; v_req record; v_score numeric; v_rank int:=0; v_question uuid; v_existing int; v_status text;
begin
 select client_id into v_client from public.dynamic_intake_sessions where id=p_session_id;
 if v_client is null then raise exception 'Intake session not found'; end if;
 if not (exists(select 1 from public.clients c join public.profiles p on p.id=c.profile_id where c.id=v_client and p.id=(select auth.uid())) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('admin','staff','coach'))) then raise exception 'Not authorized'; end if;
 delete from public.dynamic_intake_question_selections where session_id=p_session_id;
 for v_req in select r.id,r.priority,r.requirement_type,r.requirement,r.rationale,d.decision,d.confidence,d.recommended_action from public.dynamic_intake_requirements r left join lateral (select * from public.dynamic_intake_decisions d where d.session_id=r.session_id and d.requirement_id=r.id order by d.created_at desc limit 1) d on true where r.session_id=p_session_id and r.status='open' order by case r.priority when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,r.created_at loop
   v_score := case v_req.priority when 'critical' then .95 when 'high' then .80 when 'medium' then .60 else .35 end;
   if v_req.decision='missing' then v_score:=least(1,v_score+.15); elsif v_req.decision='partial' then v_score:=least(1,v_score+.08); elsif v_req.decision='needs_review' then v_score:=least(1,v_score+.12); elsif v_req.decision='satisfied' then v_score:=greatest(0,v_score-.50); end if;
   v_score := round(v_score::numeric,4); v_rank:=v_rank+1;
   insert into public.dynamic_intake_question_selections(session_id,requirement_id,selection_rank,selection_score,information_value,client_burden,priority_score,reason,selected) values(p_session_id,v_req.id,v_rank,v_score,case when v_req.decision in ('missing','partial') then .9 else .5 end,case when v_req.requirement_type='document' then .75 else .35 end,v_score,coalesce(v_req.reason,'Selected from service priority and information gap.'),v_rank=1);
 end loop;
 select requirement_id into v_req from public.dynamic_intake_question_selections where session_id=p_session_id and selected=true order by selection_rank limit 1;
 if v_req.id is null then update public.dynamic_intake_sessions set status='ready',current_step='ready_for_service_delivery',completion_score=1,updated_at=now() where id=p_session_id; return jsonb_build_object('status','ready','message','No unanswered high-value intake question remains.'); end if;
 select count(*) into v_existing from public.dynamic_intake_questions where session_id=p_session_id;
 insert into public.dynamic_intake_questions(session_id,requirement_id,client_id,sequence_no,question_text,question_type,options,required,rationale,status) select p_session_id,r.id,v_client,v_existing+1,case when r.requirement_type='document' then 'Please upload the document or evidence needed for this service requirement.' else coalesce(m.intake_question,'To help us complete your request, please provide the information needed for: '||r.requirement||'.') end,case when r.requirement_type='document' then 'file' else 'textarea' end,'[]'::jsonb,(r.priority in ('critical','high')),r.rationale,'pending' from public.dynamic_intake_requirements r left join public.service_requirement_mappings m on m.requirement_id=(select requirement_id from public.dynamic_intake_question_selections where session_id=p_session_id and selected=true limit 1) and m.active=true where r.id=(select requirement_id from public.dynamic_intake_question_selections where session_id=p_session_id and selected=true limit 1) returning id into v_question;
 update public.dynamic_intake_question_selections set question_id=v_question where session_id=p_session_id and selected=true;
 update public.dynamic_intake_sessions set status='awaiting_client',current_step='question',last_question_id=v_question,updated_at=now() where id=p_session_id;
 return jsonb_build_object('status','question_selected','question_id',v_question);
end; $function$


CREATE OR REPLACE FUNCTION public.send_marketplace_communication(p_booking_id uuid, p_body text, p_message_type text DEFAULT 'text'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare b public.marketplace_booking_requests%rowtype; c public.marketplace_communications%rowtype; r jsonb; sender text; uid uuid := auth.uid(); begin if uid is null then raise exception 'Authentication required'; end if; select * into b from public.marketplace_booking_requests where id=p_booking_id; if not found then raise exception 'Booking not found'; end if; if exists(select 1 from public.clients x where x.id=b.client_id and x.profile_id=uid) then sender := 'client'; elsif exists(select 1 from public.coaches x where x.id=b.coach_id and x.profile_id=uid) then sender := 'coach'; else raise exception 'Not a participant in this booking'; end if; r := public.marketplace_communication_risk_classify(p_body); insert into public.marketplace_communications(booking_id,client_id,coach_id,sender_role,message_type,body,moderation_status,external_contact_detected,external_business_intent_detected,risk_score,policy_action,moderation_reason) values(p_booking_id,b.client_id,b.coach_id,sender,p_message_type,p_body,case when (r->>'policy_action')='block' then 'blocked' when (r->>'policy_action') in ('review','flag') then 'flagged' else 'allowed' end,(r->>'external_contact_detected')::boolean,(r->>'external_business_intent_detected')::boolean,(r->>'risk_score')::numeric,(r->>'policy_action'),array_to_string(array(select jsonb_array_elements_text(r->'reasons')) ,', ')) returning * into c; insert into public.marketplace_communication_events(communication_id,event_type,actor_type,actor_id,event_data) values(c.id,case when c.moderation_status='blocked' then 'blocked' when c.moderation_status='flagged' then 'flagged' when c.policy_action='warn' then 'warning_issued' else 'sent' end,sender,uid,r); if c.moderation_status in ('blocked','flagged') then insert into public.marketplace_communication_risk_flags(communication_id,risk_type,risk_score,detected_by,evidence) values(c.id,case when (r->>'external_business_intent_detected')::boolean then 'off_platform_business' when (r->>'external_contact_detected')::boolean then 'external_contact' else 'other' end,(r->>'risk_score')::numeric,'rule',r); end if; return c.id; end $function$


CREATE OR REPLACE FUNCTION public.set_ai_document_fact_classification_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin new.updated_at=now(); return new; end; $function$


CREATE OR REPLACE FUNCTION public.set_blog_comment_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin new.updated_at=now(); return new; end $function$


CREATE OR REPLACE FUNCTION public.set_blog_post_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin new.updated_at=now(); if new.status='published' and old.status is distinct from 'published' and new.published_at is null then new.published_at=now(); end if; return new; end $function$


CREATE OR REPLACE FUNCTION public.set_career_intelligence_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_document_processing_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$ begin new.updated_at=now(); return new; end; $function$


CREATE OR REPLACE FUNCTION public.set_profile_sync_proposal_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$ begin new.updated_at=now(); return new; end; $function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin new.updated_at = now(); return new; end; $function$


CREATE OR REPLACE FUNCTION public.start_ai_service_workflow_execution(p_execution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; s public.ai_service_workflow_steps%rowtype; v_user uuid:=auth.uid(); v_role text; v_step uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 select * into e from public.ai_service_workflow_executions where id=p_execution_id for update;
 if not found then raise exception 'Workflow execution not found'; end if;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 if not (v_role in ('admin','staff') or (v_role='coach' and exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user))) then raise exception 'Authorized coach/staff access required'; end if;
 if e.status not in ('pending','failed') then raise exception 'Workflow execution cannot be started from status %',e.status; end if;
 select * into s from public.ai_service_workflow_steps where workflow_id=e.workflow_id and active=true order by step_order limit 1;
 if s.id is null then raise exception 'No active workflow steps configured'; end if;
 insert into public.ai_service_workflow_step_runs(execution_id,step_id,step_order,status,input_snapshot,started_at)
 values(e.id,s.id,s.step_order,'running',e.context_snapshot,now()) on conflict(execution_id,step_id) do update set status='running',input_snapshot=excluded.input_snapshot,started_at=now(),updated_at=now() returning id into v_step;
 update public.ai_service_workflow_executions set status='running',current_step_order=s.step_order,started_at=coalesce(started_at,now()),updated_at=now() where id=e.id;
 update public.ai_service_delivery_runs set status='running',workflow_stage='step_'||s.step_order,started_at=coalesce(started_at,now()),updated_at=now() where id=e.delivery_run_id;
 return jsonb_build_object('execution_id',e.id,'step_run_id',v_step,'step_order',s.step_order,'step_key',s.step_key,'status','running');
end; $function$


CREATE OR REPLACE FUNCTION public.submit_ai_workflow_review(p_execution_id uuid, p_decision text, p_notes text DEFAULT NULL::text, p_revision_instructions text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; x public.ai_service_workflow_step_runs%rowtype; v_user uuid:=auth.uid(); v_role text; v_review uuid; v_revision uuid;
begin
 select role into v_role from public.profiles where id=v_user and status='active';
 if v_role not in ('admin','staff','coach') then raise exception 'Authorized reviewer access required'; end if;
 if p_decision not in ('approved','rejected','needs_revision','needs_clarification') then raise exception 'Invalid review decision'; end if;
 select * into e from public.ai_service_workflow_executions where id=p_execution_id for update;
 if not found then raise exception 'Workflow execution not found'; end if;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 if v_role='coach' and not exists(select 1 from public.service_requests sr where sr.id=r.service_request_id and sr.assigned_coach=v_user) then raise exception 'Coach is not assigned to this service request'; end if;
 select * into x from public.ai_service_workflow_step_runs where execution_id=e.id order by step_order desc limit 1;
 insert into public.ai_workflow_reviews(execution_id,step_run_id,delivery_run_id,reviewer_id,decision,review_notes,revision_instructions,reviewed_output)
 values(e.id,x.id,r.id,v_user,p_decision,p_notes,p_revision_instructions,x.output_snapshot) returning id into v_review;
 if p_decision='needs_revision' then
   if coalesce(trim(p_revision_instructions),'')='' then raise exception 'Revision instructions are required'; end if;
   insert into public.ai_workflow_revision_requests(execution_id,step_run_id,delivery_run_id,review_id,requested_by,instructions,previous_output,status)
   values(e.id,x.id,r.id,v_review,v_user,p_revision_instructions, x.output_snapshot,'open') returning id into v_revision;
   update public.ai_service_workflow_executions set status='awaiting_review',error_message='Revision requested by human reviewer',updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='revision_requested',human_review_status='needs_revision',updated_at=now() where id=r.id;
 elsif p_decision='approved' then
   update public.ai_service_workflow_executions set status='completed',updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='final_approval',human_review_status='approved',updated_at=now() where id=r.id;
 else
   update public.ai_service_workflow_executions set status='awaiting_review',updated_at=now() where id=e.id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='human_review',human_review_status=case when p_decision='rejected' then 'rejected' else 'needs_revision' end,updated_at=now() where id=r.id;
 end if;
 return jsonb_build_object('review_id',v_review,'revision_request_id',v_revision,'decision',p_decision,'human_review_status',case when p_decision='approved' then 'approved' else 'needs_revision' end);
end; $function$


CREATE OR REPLACE FUNCTION public.submit_ai_workflow_review(p_execution_id uuid, p_step_run_id uuid, p_decision text, p_review_notes text DEFAULT NULL::text, p_revision_instructions text DEFAULT NULL::text, p_reviewed_output jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; e public.ai_service_workflow_executions%rowtype; r public.ai_service_delivery_runs%rowtype; sr public.service_requests%rowtype; rev uuid;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized reviewer access required'; end if;
 if p_decision not in ('approved','rejected','needs_revision','needs_clarification') then raise exception 'Invalid review decision'; end if;
 select * into e from public.ai_service_workflow_executions where id=p_execution_id;
 if not found then raise exception 'Workflow execution not found'; end if;
 select * into r from public.ai_service_delivery_runs where id=e.delivery_run_id;
 select * into sr from public.service_requests where id=r.service_request_id;
 if role_name='coach' and sr.assigned_coach<>u then raise exception 'Coach may review only assigned service requests'; end if;
 insert into public.ai_workflow_reviews(execution_id,step_run_id,delivery_run_id,reviewer_id,decision,review_notes,revision_instructions,reviewed_output)
 values(p_execution_id,p_step_run_id,r.id,u,p_decision,p_review_notes,p_revision_instructions,p_reviewed_output) returning id into rev;
 if p_decision='needs_revision' then
   if coalesce(trim(p_revision_instructions),'')='' then raise exception 'Revision instructions are required'; end if;
   insert into public.ai_workflow_revision_requests(execution_id,step_run_id,delivery_run_id,review_id,requested_by,instructions,target_areas,status,previous_output)
   select p_execution_id,p_step_run_id,r.id,rev,u,p_revision_instructions,'[]'::jsonb,'open',s.output_snapshot from public.ai_service_workflow_step_runs s where s.id=p_step_run_id;
   update public.ai_service_workflow_step_runs set status='awaiting_review',updated_at=now() where id=p_step_run_id;
   update public.ai_service_workflow_executions set status='awaiting_review',updated_at=now() where id=p_execution_id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',workflow_stage='revision_requested',human_review_status='needs_revision',updated_at=now() where id=r.id;
 elsif p_decision='approved' then
   update public.ai_service_workflow_step_runs set output_snapshot=coalesce(p_reviewed_output,output_snapshot),status='awaiting_review',updated_at=now() where id=p_step_run_id;
   update public.ai_service_workflow_executions set output_snapshot=coalesce(p_reviewed_output,output_snapshot),status='awaiting_review',updated_at=now() where id=p_execution_id;
   update public.ai_service_delivery_runs set output_snapshot=coalesce(p_reviewed_output,output_snapshot),human_review_status='approved',updated_at=now() where id=r.id;
   return jsonb_build_object('review_id',rev,'decision',p_decision,'status','approved','next_action','coach_or_runtime_may_complete_quality_gate');
 else
   update public.ai_service_workflow_step_runs set status='awaiting_review',updated_at=now() where id=p_step_run_id;
   update public.ai_service_workflow_executions set status='awaiting_review',updated_at=now() where id=p_execution_id;
   update public.ai_service_delivery_runs set status='awaiting_human_review',human_review_status=p_decision,updated_at=now() where id=r.id;
 end if;
 return jsonb_build_object('review_id',rev,'decision',p_decision,'revision_requested',p_decision='needs_revision');
end; $function$


CREATE OR REPLACE FUNCTION public.sync_ai_agent_subscription_from_paystack_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_type text := lower(coalesce(new.event_type,''));
  payload jsonb := coalesce(new.payload,'{}'::jsonb);
  data jsonb := coalesce(payload->'data','{}'::jsonb);
  metadata jsonb := case when jsonb_typeof(data->'metadata')='object' then data->'metadata' else '{}'::jsonb end;
  subscription_id uuid;
  subscription_code text;
  plan_code text;
  plan_key text;
  next_payment text;
  start_date text;
  new_status text;
  sub_row public.ai_agent_subscriptions%rowtype;
begin
  if event_type not in ('charge.success','subscription.create','subscription.not_renew','subscription.disable','invoice.payment_failed') then
    return new;
  end if;

  subscription_id := nullif(metadata->>'careerdev_ai_subscription_id','')::uuid;
  subscription_code := nullif(coalesce(data->'subscription'->>'subscription_code',data->>'subscription_code'),'');
  plan_code := nullif(coalesce(data->'plan'->>'plan_code',data->'subscription'->'plan'->>'plan_code'),'');
  next_payment := coalesce(data->'subscription'->>'next_payment_date',data->>'next_payment_date');
  start_date := coalesce(data->'subscription'->>'start',data->>'period_start');

  if subscription_id is not null then
    select * into sub_row from public.ai_agent_subscriptions where id=subscription_id;
  elsif subscription_code is not null then
    select * into sub_row from public.ai_agent_subscriptions where paystack_subscription_code=subscription_code order by created_at desc limit 1;
  elsif plan_code is not null then
    select p.plan_key into plan_key
    from public.ai_agent_subscription_plans p
    where p.paystack_monthly_plan_code=plan_code or p.paystack_annual_plan_code=plan_code
    limit 1;
    if plan_key is not null then
      select * into sub_row
      from public.ai_agent_subscriptions
      where plan_key=plan_key and status='pending'
      order by created_at desc limit 1;
    end if;
  end if;

  if sub_row.id is null then
    return new;
  end if;

  new_status := case
    when event_type='subscription.disable' then 'expired'
    when event_type='subscription.not_renew' then 'non_renewing'
    when event_type='invoice.payment_failed' then 'attention'
    else 'active'
  end;

  update public.ai_agent_subscriptions
  set status=new_status,
      paystack_subscription_code=coalesce(subscription_code,paystack_subscription_code),
      paystack_customer_code=coalesce(nullif(data->'customer'->>'customer_code',''),paystack_customer_code),
      paystack_transaction_reference=coalesce(nullif(coalesce(data->'transaction'->>'reference',data->>'reference'),''),paystack_transaction_reference),
      current_period_start=case when start_date is not null then start_date::timestamptz else current_period_start end,
      current_period_end=case when next_payment is not null then next_payment::timestamptz else current_period_end end,
      metadata=jsonb_build_object('last_paystack_event',event_type,'paystack_event_id',data->>'id') || coalesce(metadata,'{}'::jsonb),
      updated_at=now()
  where id=sub_row.id;

  return new;
exception when others then
  raise warning 'AI subscription webhook sync skipped: %', sqlerrm;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_client_account_from_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.role::text = 'client' then
    insert into public.clients(profile_id,status,onboarding_completed_at)
    values(new.id,'active',now())
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_verified_evidence_to_career_profile(p_evidence_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_evidence public.evidence_items%rowtype;
  v_profile public.career_profiles%rowtype;
  v_new_version integer;
  v_profile_id uuid;
  v_claim text;
  v_field text;
begin
  select * into v_evidence from public.evidence_items where id = p_evidence_item_id;
  if not found then raise exception 'Evidence item not found'; end if;
  if v_evidence.verification_status <> 'verified' then
    raise exception 'Only verified evidence can be synchronized';
  end if;

  select * into v_profile from public.career_profiles
  where client_id = v_evidence.client_id and is_current = true
  order by profile_version desc nulls last, updated_at desc
  limit 1;

  if not found then
    raise exception 'No current career profile exists for client';
  end if;

  v_claim := v_evidence.claim;
  v_field := lower(coalesce(v_evidence.evidence_type, 'general'));

  -- Record provenance first. This makes every synchronized change traceable.
  insert into public.career_profile_evidence
    (career_profile_id, evidence_item_id, field_name, confidence, verification_status)
  values
    (v_profile.id, v_evidence.id, v_field, v_evidence.confidence, v_evidence.verification_status)
  on conflict (career_profile_id, evidence_item_id, field_name)
  do update set confidence = excluded.confidence, verification_status = excluded.verification_status;

  -- Create a new immutable-ish profile version rather than silently overwriting the prior snapshot.
  v_new_version := greatest(coalesce(v_profile.profile_version, v_profile.version, 0) + 1, coalesce(v_profile.version, 0) + 1);
  insert into public.career_profiles (
    client_id, version, professional_summary, current_level, target_roles, target_industries,
    target_locations, career_interests, leadership_experience, development_gaps, is_current,
    ai_generated, ai_model, ai_prompt_version, ai_generated_at, human_reviewed,
    human_reviewed_by, human_reviewed_at, profile_status, profile_version, career_stage,
    current_job_title, current_industry, current_location, target_industry, target_role,
    target_location, interests, achievements, certifications, portfolio_evidence,
    strengths_summary, development_gaps_summary, last_intelligence_run_at
  )
  select
    client_id, v_new_version, professional_summary, current_level, target_roles, target_industries,
    target_locations, career_interests, leadership_experience, development_gaps, true,
    false, null, null, null, false, null, null, 'pending_human_review', v_new_version,
    career_stage, current_job_title, current_industry, current_location, target_industry,
    target_role, target_location, interests, achievements, certifications, portfolio_evidence,
    strengths_summary, development_gaps_summary, last_intelligence_run_at
  from public.career_profiles where id = v_profile.id
  returning id into v_profile_id;

  update public.career_profiles set is_current = false where id = v_profile.id;

  -- Conservative synchronization: only append evidence to free-text profile fields.
  -- Structured experience/skill/education records remain unchanged until a typed evidence mapper is approved.
  if v_field in ('achievement','achievements','impact','result') then
    update public.career_profiles
      set achievements = case when nullif(trim(coalesce(achievements,'')), '') is null then v_claim
                         else achievements || E'\n• ' || v_claim end,
          updated_at = now()
      where id = v_profile_id;
  elsif v_field in ('leadership','leadership_experience') then
    update public.career_profiles
      set leadership_experience = case when nullif(trim(coalesce(leadership_experience,'')), '') is null then v_claim
                         else leadership_experience || E'\n• ' || v_claim end,
          updated_at = now()
      where id = v_profile_id;
  elsif v_field in ('skill','skills','competency','competencies') then
    update public.career_profiles
      set strengths_summary = case when nullif(trim(coalesce(strengths_summary,'')), '') is null then v_claim
                         else strengths_summary || E'\n• ' || v_claim end,
          updated_at = now()
      where id = v_profile_id;
  elsif v_field in ('career_goal','target_role','target_roles','goal') then
    update public.career_profiles
      set interests = case when nullif(trim(coalesce(interests,'')), '') is null then v_claim
                         else interests || E'\n• ' || v_claim end,
          updated_at = now()
      where id = v_profile_id;
  else
    update public.career_profiles
      set portfolio_evidence = case when nullif(trim(coalesce(portfolio_evidence,'')), '') is null then v_claim
                         else portfolio_evidence || E'\n• ' || v_claim end,
          updated_at = now()
      where id = v_profile_id;
  end if;

  return v_profile_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.touch_coach_marketplace_application_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end;
$function$


CREATE OR REPLACE FUNCTION public.transition_ai_agent_execution(p_request_id uuid, p_status text, p_event_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  u uuid:=auth.uid();
  role_name text;
  req public.ai_agent_execution_requests%rowtype;
  ex public.ai_agent_executions%rowtype;
  execution_status text;
begin
  select role into role_name from public.profiles where id=u and status='active';
  if role_name not in ('admin','staff','coach','client') then raise exception 'Authorized CareerDev Global access required'; end if;

  select * into req from public.ai_agent_execution_requests where id=p_request_id for update;
  if not found then raise exception 'Execution request not found'; end if;
  if role_name in ('coach','client') and req.requested_by<>u then raise exception 'User may transition only own requests'; end if;

  if p_status not in ('running','awaiting_quality','awaiting_human_review','completed','blocked','failed','cancelled') then
    raise exception 'Invalid execution status';
  end if;
  if not public.assert_ai_agent_execution_transition(req.status,p_status) then
    raise exception 'Invalid state transition from % to %',req.status,p_status;
  end if;

  if req.execution_id is not null then
    select * into ex from public.ai_agent_executions where id=req.execution_id for update;
  end if;

  if p_status='completed' then
    if ex.id is null then
      raise exception 'Agent execution record is required before completion';
    end if;
    if ex.human_review_required and ex.human_review_status <> 'approved' then
      raise exception 'Independent human approval required before completion';
    end if;
    if ex.human_review_required and not exists (
      select 1 from public.ai_human_approval_requests a
      where a.request_id=req.id and a.status='approved' and a.approved_by is not null
    ) then
      raise exception 'Independent human approval record required before completion';
    end if;
  end if;

  execution_status := case when p_status='awaiting_quality' then 'running' else p_status end;

  update public.ai_agent_execution_requests
  set status=p_status,
      completed_at=case when p_status in ('completed','blocked','failed','cancelled') then now() else completed_at end
  where id=req.id;

  if ex.id is not null then
    update public.ai_agent_executions
    set status=execution_status,
        error_message=case when p_status in ('failed','blocked')
          then coalesce(p_event_data->>'reason',error_message) else error_message end,
        updated_at=now(),
        completed_at=case when p_status='completed' then now() else completed_at end
    where id=ex.id;
  end if;

  insert into public.ai_agent_execution_events(request_id,execution_id,event_type,event_data,actor_id)
  values(
    req.id,req.execution_id,
    case
      when p_status='running' then 'started'
      when p_status='awaiting_quality' then 'quality_started'
      when p_status='awaiting_human_review' then 'human_review'
      when p_status='completed' then 'completed'
      when p_status='blocked' then 'blocked'
      when p_status='failed' then 'failed'
      else 'cancelled'
    end,
    coalesce(p_event_data,'{}'::jsonb),u
  );

  return jsonb_build_object(
    'request_id',req.id,'execution_id',req.execution_id,
    'previous_status',req.status,'status',p_status,
    'execution_status',execution_status
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.update_ai_operational_alert(p_alert_id uuid, p_status text, p_assigned_to uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u uuid:=auth.uid(); role_name text; x public.ai_operational_alerts%rowtype;
begin
 select role into role_name from public.profiles where id=u and status='active';
 if role_name not in ('admin','staff','coach') then raise exception 'Authorized operations access required'; end if;
 if p_status not in ('open','acknowledged','resolved','dismissed') then raise exception 'Invalid alert status'; end if;
 select * into x from public.ai_operational_alerts where id=p_alert_id for update;
 if not found then raise exception 'Alert not found'; end if;
 update public.ai_operational_alerts set status=p_status,assigned_to=coalesce(p_assigned_to,assigned_to),acknowledged_at=case when p_status='acknowledged' then coalesce(acknowledged_at,now()) else acknowledged_at end,resolved_at=case when p_status in ('resolved','dismissed') then coalesce(resolved_at,now()) else null end,updated_at=now() where id=p_alert_id;
 insert into public.ai_audit_events(event_type,actor_type,actor_id,event_data) values('operational_alert_updated','user',u,jsonb_build_object('alert_id',p_alert_id,'status',p_status));
 return jsonb_build_object('alert_id',p_alert_id,'status',p_status);
end; $function$


CREATE OR REPLACE FUNCTION public.update_client_marketplace_preferences(p_preferred_coach_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare uid uuid:=auth.uid(); cid uuid; begin if uid is null then raise exception 'Authentication required'; end if; select id into cid from public.clients where profile_id=uid; if cid is null then raise exception 'Client profile not found'; end if; if p_preferred_coach_id is not null and not exists(select 1 from public.coaches co join public.coach_marketplace_profiles mp on mp.coach_id=co.id where co.id=p_preferred_coach_id and co.application_status='active' and mp.marketplace_status='active') then raise exception 'Selected coach is not active on the marketplace'; end if; update public.clients set preferred_coach_id=p_preferred_coach_id,updated_at=now() where id=cid; end $function$


CREATE OR REPLACE FUNCTION public.update_client_marketplace_progress(p_progress_id uuid, p_status text DEFAULT NULL::text, p_progress_pct integer DEFAULT NULL::integer, p_current_stage text DEFAULT NULL::text, p_next_action text DEFAULT NULL::text, p_client_visible_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare uid uuid:=auth.uid(); cid uuid; owner_id uuid; begin if uid is null then raise exception 'Authentication required'; end if; select id into cid from public.clients where profile_id=uid; select client_id into owner_id from public.client_marketplace_progress where id=p_progress_id; if owner_id is null or owner_id<>cid then raise exception 'Progress record not found'; end if; if p_status is not null and p_status not in ('not_started','intake','matched','booked','in_progress','awaiting_client','completed','cancelled') then raise exception 'Invalid progress status'; end if; if p_progress_pct is not null and (p_progress_pct<0 or p_progress_pct>100) then raise exception 'Progress must be between 0 and 100'; end if; update public.client_marketplace_progress set status=coalesce(p_status,status),progress_pct=coalesce(p_progress_pct,progress_pct),current_stage=coalesce(p_current_stage,current_stage),next_action=coalesce(p_next_action,next_action),client_visible_notes=coalesce(p_client_visible_notes,client_visible_notes),updated_at=now() where id=p_progress_id; end $function$


CREATE OR REPLACE FUNCTION public.update_client_service_outcome(p_outcome_id uuid, p_status text, p_note text DEFAULT NULL::text, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare o public.client_service_outcomes%rowtype; u uuid:=auth.uid(); role_name text; old_status text;
begin
 select * into o from public.client_service_outcomes where id=p_outcome_id for update;
 if not found then raise exception 'Outcome not found'; end if;
 select role into role_name from public.profiles where id=u and status='active';
 if not (exists(select 1 from public.clients c where c.id=o.client_id and c.profile_id=u) or role_name in ('admin','staff') or (role_name='coach' and exists(select 1 from public.service_requests sr where sr.id=o.service_request_id and sr.assigned_coach=u))) then raise exception 'Authorized access required'; end if;
 if p_status not in ('reported','verified','achieved','in_progress','not_achieved','withdrawn') then raise exception 'Invalid outcome status'; end if;
 old_status:=o.status;
 update public.client_service_outcomes set status=p_status,confidence=case when p_status='verified' then greatest(coalesce(confidence,0),0.9) else confidence end,verified_by=case when p_status='verified' and role_name in ('admin','staff') then u else verified_by end,verified_at=case when p_status='verified' and role_name in ('admin','staff') then now() else verified_at end,achieved_at=case when p_status='achieved' then coalesce(achieved_at,now()) else achieved_at end,updated_at=now() where id=o.id;
 insert into public.client_outcome_updates(outcome_id,client_id,update_type,previous_status,new_status,note,evidence,created_by) values(o.id,o.client_id,'status_change',old_status,p_status,p_note,coalesce(p_evidence,'{}'::jsonb),u);
 return jsonb_build_object('outcome_id',o.id,'previous_status',old_status,'status',p_status);
end; $function$


CREATE OR REPLACE FUNCTION public.update_coach_marketplace_profile(p_display_name text, p_headline text, p_bio text, p_specializations text[], p_coaching_formats text[], p_languages text[], p_timezone text, p_country text, p_years_coaching integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_coach_id uuid; v_id uuid; begin select c.id into v_coach_id from public.coaches c where c.profile_id=(select auth.uid()); if v_coach_id is null then raise exception 'Coach account not found'; end if; if p_years_coaching is not null and p_years_coaching < 0 then raise exception 'Years coaching cannot be negative'; end if; insert into public.coach_marketplace_profiles(coach_id,display_name,headline,bio,specializations,coaching_formats,languages,timezone,country,years_coaching) values(v_coach_id,nullif(trim(p_display_name),''),nullif(trim(p_headline),''),nullif(trim(p_bio),''),coalesce(p_specializations,'{}'),coalesce(p_coaching_formats,'{}'),coalesce(p_languages,'{}'),nullif(trim(p_timezone),''),nullif(trim(p_country),''),p_years_coaching) on conflict (coach_id) do update set display_name=excluded.display_name,headline=excluded.headline,bio=excluded.bio,specializations=excluded.specializations,coaching_formats=excluded.coaching_formats,languages=excluded.languages,timezone=excluded.timezone,country=excluded.country,years_coaching=excluded.years_coaching,updated_at=now() returning id into v_id; return v_id; end $function$


CREATE OR REPLACE FUNCTION public.update_marketplace_notification_preferences(p_email_enabled boolean DEFAULT NULL::boolean, p_sms_enabled boolean DEFAULT NULL::boolean, p_in_app_enabled boolean DEFAULT NULL::boolean, p_booking_updates boolean DEFAULT NULL::boolean, p_payment_updates boolean DEFAULT NULL::boolean, p_session_reminders boolean DEFAULT NULL::boolean, p_messages boolean DEFAULT NULL::boolean, p_reviews boolean DEFAULT NULL::boolean, p_verification_updates boolean DEFAULT NULL::boolean, p_dispute_updates boolean DEFAULT NULL::boolean, p_marketing_enabled boolean DEFAULT NULL::boolean, p_quiet_hours_start time without time zone DEFAULT NULL::time without time zone, p_quiet_hours_end time without time zone DEFAULT NULL::time without time zone, p_timezone text DEFAULT NULL::text)
 RETURNS marketplace_notification_preferences
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_row public.marketplace_notification_preferences;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.marketplace_notification_preferences(profile_id)
  values (auth.uid())
  on conflict (profile_id) do nothing;

  update public.marketplace_notification_preferences
  set email_enabled = coalesce(p_email_enabled, email_enabled),
      sms_enabled = coalesce(p_sms_enabled, sms_enabled),
      in_app_enabled = coalesce(p_in_app_enabled, in_app_enabled),
      booking_updates = coalesce(p_booking_updates, booking_updates),
      payment_updates = coalesce(p_payment_updates, payment_updates),
      session_reminders = coalesce(p_session_reminders, session_reminders),
      messages = coalesce(p_messages, messages),
      reviews = coalesce(p_reviews, reviews),
      verification_updates = coalesce(p_verification_updates, verification_updates),
      dispute_updates = coalesce(p_dispute_updates, dispute_updates),
      marketing_enabled = coalesce(p_marketing_enabled, marketing_enabled),
      quiet_hours_start = p_quiet_hours_start,
      quiet_hours_end = p_quiet_hours_end,
      timezone = coalesce(p_timezone, timezone),
      updated_at = now()
  where profile_id = auth.uid()
  returning * into v_row;
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.validate_coach_service_offering()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.services s where s.id = new.service_id and s.active = true) then
    raise exception 'Selected service is not active.';
  end if;
  if new.duration_minutes <= 0 or new.duration_minutes > 480 then
    raise exception 'Duration must be between 1 and 480 minutes.';
  end if;
  if new.price is not null and new.price < 0 then
    raise exception 'Price cannot be negative.';
  end if;
  if new.title is null or btrim(new.title) = '' then
    raise exception 'A service title is required.';
  end if;
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.validate_marketplace_financial_ledger(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare t public.marketplace_transactions%rowtype; refund_total numeric; payout_total numeric; result jsonb;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if not exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('staff','admin')) then raise exception 'Staff or admin access required'; end if;
 select * into t from public.marketplace_transactions where id=p_transaction_id;
 if not found then raise exception 'Marketplace transaction not found'; end if;
 select coalesce(sum(amount),0) into refund_total from public.marketplace_refunds where transaction_id=t.id and status in ('approved','processing','completed','partially_completed');
 select coalesce(sum(payout_amount),0) into payout_total from public.marketplace_payouts where transaction_id=t.id and status in ('processing','paid','eligible');
 result=jsonb_build_object(
  'transaction_id',t.id,
  'gross_amount',t.gross_amount,
  'platform_share_pct',t.platform_share_pct,
  'coach_share_pct',t.coach_share_pct,
  'platform_fee',t.platform_fee,
  'coach_earnings',t.coach_earnings,
  'refund_total',refund_total,
  'payout_total',payout_total,
  'split_valid',abs((t.platform_share_pct+t.coach_share_pct)-100) < 0.000001 and abs((t.platform_fee+t.coach_earnings)-t.gross_amount) < 0.000001,
  'refunds_valid',refund_total <= t.gross_amount,
  'payouts_valid',payout_total <= t.coach_earnings,
  'ledger_balanced',abs((t.platform_fee+t.coach_earnings+t.gross_amount*0)-t.gross_amount) < 0.000001
 );
 return result;
end; $function$


CREATE OR REPLACE FUNCTION public.verify_ai_production_release(p_release_candidate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$ declare v_user uuid:=auth.uid(); v_role text; v_rc public.ai_release_candidates; v_elig public.ai_production_eligibility; v_prompt_status text; v_model_status text; v_passed_run public.ai_test_runs; v_blockers jsonb:='[]'::jsonb; begin if v_user is null then raise exception 'Authentication required'; end if; select role into v_role from public.profiles where id=v_user and status='active' limit 1; if v_role not in ('admin','staff') then raise exception 'Staff or admin access required'; end if; select * into v_rc from public.ai_release_candidates where id=p_release_candidate_id; if v_rc.id is null then raise exception 'Release candidate not found'; end if; select * into v_elig from public.ai_production_eligibility where release_candidate_id=p_release_candidate_id order by evaluated_at desc limit 1; if v_elig.id is null or v_elig.eligible is not true then v_blockers:=v_blockers||jsonb_build_array('Production safety gate must be eligible.'); end if; select status into v_prompt_status from public.ai_prompt_versions where id=v_rc.prompt_version_id; if v_prompt_status not in ('approved','production') then v_blockers:=v_blockers||jsonb_build_array('Approved prompt version is required.'); end if; select status into v_model_status from public.ai_model_versions where id=v_rc.model_version_id; if v_model_status not in ('approved','production') then v_blockers:=v_blockers||jsonb_build_array('Approved model version is required.'); end if; select * into v_passed_run from public.ai_test_runs where test_case_id in (select jsonb_array_elements_text(v_rc.test_case_ids)) and status='passed' order by completed_at desc nulls last limit 1; if v_passed_run.id is null then v_blockers:=v_blockers||jsonb_build_array('A passed governed test run is required.'); end if; if jsonb_array_length(v_blockers)>0 then update public.ai_production_eligibility set verification_status='blocked',verification_details=jsonb_build_object('blocking_reasons',v_blockers,'verified_at',now()),verified_by=v_user,verified_at=now() where id=v_elig.id; return jsonb_build_object('verified',false,'status','blocked','blocking_reasons',v_blockers); end if; update public.ai_production_eligibility set verification_status='verified',verification_details=jsonb_build_object('release_candidate_id',v_rc.id,'prompt_status',v_prompt_status,'model_status',v_model_status,'governed_test_run_id',v_passed_run.id,'deployment_verified',true,'verified_at',now()),verified_by=v_user,verified_at=now() where id=v_elig.id; return jsonb_build_object('verified',true,'status','verified','release_candidate_id',v_rc.id,'governed_test_run_id',v_passed_run.id,'verified_at',now()); end; $function$

