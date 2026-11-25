import type { ReactNode } from 'react';
import DashboardAccess from '../components/dashboard-access';

export default function CoachDashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardAccess role="coach">{children}</DashboardAccess>;
}
