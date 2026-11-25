import type { ReactNode } from 'react';
import DashboardAccess from '../components/dashboard-access';

export default function ClientDashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardAccess role="client">{children}</DashboardAccess>;
}
