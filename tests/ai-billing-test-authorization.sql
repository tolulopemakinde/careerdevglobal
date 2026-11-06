-- Isolated TEST only. Every authorization fixture and attempted change rolls back.
begin;
create function pg_temp.test_bounded_billing_authorization() returns jsonb language plpgsql as $$
declare fixture_user uuid;blocked boolean;checks jsonb:='[]';
begin
 select user_id into fixture_user from public.ai_agent_subscriptions
 where id='fd310d20-d1b7-48e2-99b9-37219571407a'
 and metadata->>'synthetic'='true' and metadata->>'no_provider_payment'='true';
 if fixture_user is null then raise exception 'Known nonpayment fixture required'; end if;
 if (select self_service_enabled from public.ai_billing_release_config where id) is distinct from false
 or (select enabled from public.ai_refund_policy_config where id) is distinct from false then raise exception 'Both global gates must remain off'; end if;
 if has_table_privilege('anon','public.ai_billing_test_authorizations','SELECT')
 or has_table_privilege('authenticated','public.ai_billing_test_authorizations','SELECT')
 or has_table_privilege('authenticated','public.ai_billing_test_authorizations','INSERT')
 or has_table_privilege('authenticated','public.ai_billing_test_authorizations','UPDATE') then raise exception 'Private authorization exposed'; end if;
 if not (select relrowsecurity from pg_class where oid='public.ai_billing_test_authorizations'::regclass) then raise exception 'RLS required'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','private service-only RLS authorization','status','pass'));
 insert into public.ai_billing_test_authorizations(user_id,approval_reference,project_ref,enabled,expires_at)
 values(fixture_user,'owner-paid-fresher-20261104-a','yyevuwvtrktrzwuzeddo',true,now()+interval '10 minutes');
 blocked:=false;begin update public.ai_billing_test_authorizations set amount_minor=1500000 where user_id=fixture_user;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Budget cap changed'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','approved fixed budget constraint','status','pass'));
 blocked:=false;begin update public.ai_billing_test_authorizations set expires_at=now()+interval '25 hours' where user_id=fixture_user;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Approval lifetime unbounded'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','authorization lifetime bounded','status','pass'));
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',fixture_user)::text,true);
 execute 'set local role authenticated';
 blocked:=false;begin perform user_id from public.ai_billing_test_authorizations;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Customer could read private authorization'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','actual customer role cannot read scopes','status','pass'));
 blocked:=false;begin update public.ai_billing_test_authorizations set enabled=true where user_id=fixture_user;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Customer could approve billing'; end if;
 checks:=checks||jsonb_build_array(jsonb_build_object('name','actual customer role cannot enable scopes','status','pass'));
 execute 'reset role';
 return checks;
end;$$;
select pg_temp.test_bounded_billing_authorization() as results;
rollback;
