-- Isolated project only. This script rolls back all fixture writes.
begin;
create function pg_temp.test_ai_profile_boundary() returns jsonb language plpgsql as $$
declare u uuid; blocked boolean;
begin
 select id into u from public.profiles where role='client' and status='active' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 blocked:=false;begin update public.profiles set role='admin' where id=u;exception when raise_exception then if sqlerrm like 'Users cannot change their own role%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Self role change permitted';end if;
 blocked:=false;begin update public.profiles set status='suspended' where id=u;exception when raise_exception then if sqlerrm like 'Users cannot change their own role%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Self status change permitted';end if;
 return '{"role_self_promotion":"blocked","own_status_mutation":"blocked"}'::jsonb;
end;$$;
select pg_temp.test_ai_profile_boundary() as results;
rollback;
