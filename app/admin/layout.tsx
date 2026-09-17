'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/admin/login';
  if (isLogin) return <>{children}</>;

  const linkStyle = { color: '#173b59', textDecoration: 'none', fontWeight: 800, padding: '8px 11px', border: '1px solid #c8d9e8', borderRadius: 9, background: '#fff' } as const;

  return <>
    <nav aria-label="Admin navigation" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(238,247,255,.96)', borderBottom: '1px solid #d8e6f1', backdropFilter: 'blur(8px)' }}>
      <a href="/admin" style={linkStyle}>Admin Dashboard</a>
      <a href="/admin/users" style={linkStyle}>User Directory</a>
      <a href="/coach-admin" style={linkStyle}>Coach Review</a>
    </nav>
    {children}
  </>;
}
