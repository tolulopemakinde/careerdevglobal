-- Test-only scoped baseline, copied verbatim from production pg_policies on 2026-11-01.
-- Run only in disposable project yyevuwvtrktrzwuzeddo. Production already has these policies.
create policy "Public can view active AI subscription plans" on public.ai_agent_subscription_plans for select to anon,authenticated using(active=true);
create policy "Users can view their own AI subscriptions" on public.ai_agent_subscriptions for select to authenticated using((select auth.uid())=user_id);
create policy ai_credit_ledger_read_own on public.ai_credit_ledger for select to authenticated using((select auth.uid())=user_id);

