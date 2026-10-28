import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabase-server';
import type { DashboardRole } from './dashboard-navigation';
import type { ReactNode } from 'react';

// Navigation visibility is never the permission boundary. Database RLS and
// RPC checks remain in place; validate identity and role before rendering too.
export default async function DashboardAccess({ role, children }: { role: DashboardRole; children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${role}/login?next=/${role}-dashboard`);
  const { data, error } = await supabase.rpc('get_my_role');
  const account = Array.isArray(data) ? data[0] : data;
  if (error) return <main><h1>Dashboard unavailable</h1><p>We could not verify your account permissions. Please refresh and try again.</p></main>;
  if (account?.role !== role || account?.status !== 'active') {
    return <main><h1>Dashboard access unavailable</h1><p>This dashboard requires an active {role} account.</p><a href={role === 'coach' ? '/coach-account' : '/account'}>View your account</a></main>;
  }
  return children;
}
