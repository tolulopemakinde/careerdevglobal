'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';

type Row = Record<string, any>;

export default function AdminUsersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [users, setUsers] = useState<Row[]>([]);
  const [details, setDetails] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      window.location.href = '/admin/login';
      return;
    }
    const { data: roleData, error: roleError } = await supabase.rpc('get_my_role');
    if (roleError || !['admin', 'staff'].includes(roleData?.role)) {
      setMessage('Staff/Admin access is required.');
      setLoading(false);
      return;
    }
    if (roleData?.status && roleData.status !== 'active') {
      setMessage('Your Staff/Admin account is not active.');
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc('admin_get_platform_operations');
    if (error) {
      setMessage(error.message);
    } else {
      setUsers((data?.profiles || []) as Row[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function viewDetails(user: Row) {
    setSelected(user);
    setDetails(null);
    setDetailLoading(true);
    setMessage('');
    const { data, error } = await supabase.rpc('admin_get_user_details', { p_user_id: user.id });
    if (error) setMessage(error.message);
    else setDetails(data as Row);
    setDetailLoading(false);
  }

  const visible = users.filter((u) => {
    const matchesRole = role === 'all' || String(u.role || '').toLowerCase() === role;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [u.full_name, u.email, u.country, u.role, u.status].some(v => String(v ?? '').toLowerCase().includes(q));
    return matchesRole && matchesSearch;
  });

  const card = { background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 } as const;
  const button = { border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' as const };
  const field = (label: string, value: any) => <div style={{ padding: '10px 0', borderBottom: '1px solid #edf2f6' }}><div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#607487' }}>{label.replaceAll('_', ' ')}</div><div style={{ marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</div></div>;

  return <main style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% 0%,#f8fcff 0,#eef7ff 45%,#e6f3fc 100%)', color: '#09233f', padding: '36px 16px 70px' }}>
    <div style={{ maxWidth: 1450, margin: '0 auto' }}>
      <header style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><div style={{ fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#1671b9' }}>CareerDev Global</div><h1 style={{ fontSize: 'clamp(2rem,5vw,3rem)', margin: '6px 0' }}>User Directory</h1><p style={{ margin: 0, color: '#527085' }}>View complete platform information for clients, coaches, staff and administrators.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a href="/admin" style={{ ...button, textDecoration: 'none' }}>Back to Admin</a><button onClick={load} style={button}>Refresh</button></div>
      </header>
      {message && <div style={{ ...card, marginTop: 16 }}>{message}</div>}
      <section style={{ ...card, marginTop: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, country…" style={{ flex: '1 1 300px', padding: 10, border: '1px solid #c8d9e8', borderRadius: 9 }} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: 10, border: '1px solid #c8d9e8', borderRadius: 9 }}><option value="all">All roles</option><option value="client">Clients</option><option value="coach">Coaches</option><option value="staff">Staff</option><option value="admin">Administrators</option></select>
        </div>
        {loading ? <p>Loading users…</p> : <div style={{ overflowX: 'auto', marginTop: 16 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}><thead><tr>{['Name','Email','Role','Status','Country','Timezone','Created','Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: '2px solid #dbe6ef', fontSize: 12, color: '#607487' }}>{h}</th>)}</tr></thead><tbody>{visible.map(u => <tr key={u.id}>{[u.full_name,u.email,u.role,u.status,u.country,u.timezone,u.created_at].map((v,i) => <td key={i} style={{ padding: 10, borderBottom: '1px solid #edf2f6', fontSize: 13 }}>{String(v ?? '—')}</td>)}<td style={{ padding: 10, borderBottom: '1px solid #edf2f6' }}><button onClick={() => viewDetails(u)} style={button}>View details</button></td></tr>)}</tbody></table>{visible.length === 0 && <p style={{ color: '#607487' }}>No users found.</p>}</div>}
      </section>

      {selected && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(4,24,40,.48)', zIndex: 50, padding: 16, overflowY: 'auto' }} onClick={() => setSelected(null)}>
        <div style={{ ...card, maxWidth: 1050, margin: '30px auto', boxShadow: '0 24px 70px rgba(0,30,60,.2)' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 style={{ margin: 0 }}>{selected.full_name || 'User details'}</h2><p style={{ margin: '5px 0 0', color: '#607487' }}>{selected.email} · {selected.role}</p></div><button onClick={() => setSelected(null)} style={button}>Close</button></div>
          {detailLoading ? <p style={{ marginTop: 20 }}>Loading details…</p> : details && <div style={{ display: 'grid', gap: 18, marginTop: 20 }}>
            <section style={card}><h3 style={{ marginTop: 0 }}>Account profile</h3>{Object.entries(details.profile || {}).map(([k,v]) => field(k,v))}</section>
            {details.client && <section style={card}><h3 style={{ marginTop: 0 }}>Client information</h3>{Object.entries(details.client).map(([k,v]) => field(k,v))}</section>}
            {details.coach?.core && <section style={card}><h3 style={{ marginTop: 0 }}>Coach professional information</h3>{Object.entries(details.coach.core).map(([k,v]) => field(k,v))}<h3>Marketplace profile</h3>{Object.entries(details.coach.marketplace || {}).map(([k,v]) => field(k,v))}<h3>Marketplace onboarding</h3>{Object.entries(details.coach.onboarding || {}).map(([k,v]) => field(k,v))}</section>}
            {Array.isArray(details.application_history) && details.application_history.length > 0 && <section style={card}><h3 style={{ marginTop: 0 }}>Coach application history</h3>{details.application_history.map((a: Row, i: number) => <div key={a.id || i} style={{ padding: 12, border: '1px solid #e1ebf3', borderRadius: 10, marginTop: 10 }}>{Object.entries(a).map(([k,v]) => field(k,v))}</div>)}</section>}
          </div>}
        </div>
      </div>}
    </div>
  </main>;
}
