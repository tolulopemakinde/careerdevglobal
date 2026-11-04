-- Isolated baseline reconciliation from read-only production catalog, 3 November 2026.
-- Policies copied verbatim; never apply this fixture script to production.
-- Exact production role/status guard body; the previous test baseline guarded role only.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN
 IF OLD.id = auth.uid() AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status) THEN
  RAISE EXCEPTION 'Users cannot change their own role or status';
 END IF;
 RETURN NEW;
END;
$function$;
alter policy "users can create own profile" on public."profiles" to "authenticated" with check (((id = ( SELECT auth.uid() AS uid)) AND (role = 'client'::user_role) AND (status = 'active'::text)));
create policy "marketplace refund events participants select" on public."marketplace_refund_events" for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM (marketplace_refunds r
     JOIN marketplace_transactions t ON ((t.id = r.transaction_id)))
  WHERE ((r.id = marketplace_refund_events.refund_id) AND ((t.client_id = ( SELECT auth.uid() AS uid)) OR (t.coach_id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['staff'::user_role, 'admin'::user_role])))))));
create policy "marketplace refunds participants select" on public."marketplace_refunds" for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM marketplace_transactions t
  WHERE ((t.id = marketplace_refunds.transaction_id) AND ((t.client_id = ( SELECT auth.uid() AS uid)) OR (t.coach_id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['staff'::user_role, 'admin'::user_role])))))));
create policy "marketplace dispute events participants select" on public."marketplace_dispute_events" for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM (marketplace_disputes d
     JOIN marketplace_transactions t ON ((t.id = d.transaction_id)))
  WHERE ((d.id = marketplace_dispute_events.dispute_id) AND ((t.client_id = ( SELECT auth.uid() AS uid)) OR (t.coach_id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['staff'::user_role, 'admin'::user_role])))))));
create policy "marketplace_payout_transfer_events_staff_admin_manage" on public."marketplace_payout_transfer_events" for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['staff'::user_role, 'admin'::user_role])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['staff'::user_role, 'admin'::user_role]))))));
create policy "marketplace_payout_transfer_events_staff_admin_select" on public."marketplace_payout_transfer_events" for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['staff'::user_role, 'admin'::user_role]))))));
create policy "ai_agent_executions_insert" on public."ai_agent_executions" for INSERT to "authenticated" with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::text) AND (p.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role, 'coach'::user_role])))))));
create policy "ai_agent_access_authenticated_read" on public."ai_agent_access" for SELECT to "authenticated" using ((active = true));
create policy "ai_agent_validation_cases_read" on public."ai_agent_validation_cases" for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::text) AND (p.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role, 'coach'::user_role, 'client'::user_role]))))));
create policy "ai_agent_certification_checks_read" on public."ai_agent_certification_checks" for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::text) AND (p.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role, 'coach'::user_role, 'client'::user_role]))))));
create policy "ai_agent_certifications_read" on public."ai_agent_certifications" for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.status = 'active'::text) AND (p.role = ANY (ARRAY['admin'::user_role, 'staff'::user_role, 'coach'::user_role, 'client'::user_role]))))));
create policy "Public can view active plan service entitlements" on public."ai_plan_service_entitlements" for SELECT to "anon","authenticated" using (((enabled = true) AND (availability_status = 'available'::text) AND (EXISTS ( SELECT 1
   FROM ai_agent_subscription_plans p
  WHERE ((p.plan_key = ai_plan_service_entitlements.plan_key) AND (p.active = true))))));
create policy "Users can view own service usage" on public."ai_plan_service_usage" for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));
create policy "ai_credit_operations_read_authenticated" on public."ai_credit_operations" for SELECT to "authenticated" using ((active = true));
