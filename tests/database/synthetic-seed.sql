-- LOCAL-ONLY synthetic data. Executed only after the Docker target guard.
BEGIN;
INSERT INTO auth.users(id,email)
SELECT ('11111111-1111-4111-8111-'||lpad(n::text,12,'0'))::uuid,'fixture-'||n||'@example.test' FROM generate_series(1,6)n;
INSERT INTO public.profiles(id,full_name,email,role,status)
SELECT id,'Synthetic fixture '||right(id::text,1),email,
 CASE WHEN right(id::text,1) IN ('1','2') THEN 'client'::public.user_role WHEN right(id::text,1)='5' THEN 'admin'::public.user_role ELSE 'coach'::public.user_role END,'active'
FROM auth.users;
UPDATE public.clients SET id=('33333333-3333-4333-8333-'||right(profile_id::text,12))::uuid;
INSERT INTO public.coaches(id,profile_id,application_status,professional_title,professional_bio,timezone,approved_at)
SELECT ('22222222-2222-4222-8222-'||right(id::text,12))::uuid,id,
 CASE WHEN right(id::text,1)='6' THEN 'under_review'::public.coach_status ELSE 'approved'::public.coach_status END,
 'Synthetic career coach','Synthetic public biography','Africa/Lagos',CASE WHEN right(id::text,1)='6' THEN NULL ELSE now() END
FROM public.profiles WHERE role='coach';
INSERT INTO public.coach_marketplace_profiles(coach_id,display_name,bio,verification_status,marketplace_status,profile_completion_pct,coaching_formats)
SELECT id,'Synthetic coach '||right(id::text,1),'Synthetic published biography',CASE WHEN right(id::text,1)='6' THEN 'pending' ELSE 'verified' END,
 CASE WHEN right(id::text,1)='4' THEN 'paused' ELSE 'active' END,100,ARRAY['Structured']
FROM public.coaches;
INSERT INTO public.services(id,name,slug,category,active)
VALUES('44444444-4444-4444-8444-000000000001','Synthetic career coaching','synthetic-career-coaching','Career Development',true);
INSERT INTO public.coach_service_offerings(id,coach_id,service_id,title,price,currency,duration_minutes,delivery_mode,active)
SELECT ('55555555-5555-4555-8555-'||right(id::text,12))::uuid,id,'44444444-4444-4444-8444-000000000001','Synthetic fixture only',0,'NGN',30,'online',true
FROM public.coaches;
INSERT INTO public.coach_availability(coach_id,day_of_week,start_time,end_time,timezone,active)
SELECT id,1,'09:00','17:00','Africa/Lagos',true FROM public.coaches;
INSERT INTO public.coach_marketplace_onboarding(coach_id,onboarding_status,required_agreements_accepted,eligible_for_activation)
SELECT id,CASE WHEN right(id::text,1)='6' THEN 'submitted' ELSE 'active' END,true,right(id::text,1)<>'6' FROM public.coaches;
INSERT INTO public.career_intelligence_profiles(profile_id) SELECT profile_id FROM public.clients;
INSERT INTO public.career_profiles(id,client_id)
SELECT ('66666666-6666-4666-8666-'||right(id::text,12))::uuid,id FROM public.clients;
INSERT INTO public.career_profile_versions(client_id,career_profile_id,version,snapshot)
SELECT client_id,id,1,'{"synthetic":true}'::jsonb FROM public.career_profiles;
INSERT INTO public.career_profile_comparisons(client_id,career_profile_id,from_version,to_version)
SELECT client_id,id,1,1 FROM public.career_profiles;
INSERT INTO public.career_profile_quality_runs(client_id,career_profile_id,trigger_type)
SELECT client_id,id,'manual' FROM public.career_profiles;
INSERT INTO public.service_requests(client_id,service_id,original_request,assigned_coach)
SELECT id,'44444444-4444-4444-8444-000000000001','Synthetic request only','11111111-1111-4111-8111-000000000003' FROM public.clients WHERE right(id::text,1)='1';
INSERT INTO public.ai_agent_subscription_plans(plan_key,name,description,monthly_price,annual_price,monthly_credits,active,included_agents)
VALUES('synthetic_fixture','Synthetic — not purchasable','Synthetic fixture only',0,0,25,true,ARRAY['career_assessment_agent']);
INSERT INTO public.ai_agent_subscriptions(user_id,plan_key,billing_interval,status,currency,amount,current_period_start,current_period_end,metadata)
SELECT profile_id,'synthetic_fixture','monthly','active','NGN',0,now(),now()+interval '30 days','{"synthetic":true,"provider_charged":false}'::jsonb FROM public.clients;
INSERT INTO storage.buckets(id,name,public) VALUES('client-documents','client-documents',false);
INSERT INTO storage.objects(bucket_id,name,owner_id)
SELECT 'client-documents',profile_id::text||'/synthetic.txt',profile_id::text FROM public.clients;
-- Deterministic fixture vectors; no embedding provider invoked.
INSERT INTO public.coach_semantic_profiles(coach_id,embedding_model,source_text,embedding)
SELECT id,'gte-small','Synthetic published biography',(ARRAY[1::real]||array_fill(0::real,ARRAY[383]))::extensions.vector FROM public.coaches
ON CONFLICT(coach_id) DO UPDATE SET embedding=excluded.embedding;
COMMIT;
