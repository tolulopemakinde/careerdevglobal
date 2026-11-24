-- Revoke legacy write access from authenticated users; the Admin RPC and RLS
-- policy provide the intended read path, while service_role retains ownership
-- of server-side workflows.
revoke all on public.ai_release_candidates from public, anon, authenticated;
grant select on public.ai_release_candidates to authenticated;
grant all on public.ai_release_candidates to service_role;
