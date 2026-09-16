'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

export default function CoachAdminPage() {
  const supabase = createSupabaseBrowserClient();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('coach_marketplace_applications').select('*').order('created_at', { ascending: false });
    if (error) setMessage(error.message); else setApps(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function review(id: string, decision: 'approve' | 'reject') {
    setMessage('');
    const { data, error } = await supabase.rpc('admin_review_coach_application', { p_application_id: id, p_decision: decision, p_notes: decision === 'approve' ? 'Approved for marketplace onboarding.' : 'Application not approved at this stage.' });
    if (error) setMessage(error.message); else setMessage(JSON.stringify(data));
    await load();
  }

  return (
    <main style={{ minHeight: '100vh', padding: '48px 24px', background: '#eef7ff', color: '#09233f' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#1671b9' }}>CareerDev Global</p>
        <h1 style={{ fontSize: 'clamp(2rem,5vw,3.5rem)', margin: '8px 0' }}>Coach Marketplace Review</h1>
        <p style={{ maxWidth: 760, lineHeight: 1.7 }}>Review coach applications before they enter the marketplace. Approval creates the controlled coach profile; activation remains gated by agreements, verification and live availability.</p>
        {message && <div style={{ margin: '20px 0', padding: 14, borderRadius: 10, background: '#fff', border: '1px solid #c8d9e8', overflowWrap: 'anywhere' }}>{message}</div>}
        {loading ? <p>Loading applications…</p> : apps.length === 0 ? <div style={{ background: '#fff', borderRadius: 16, padding: 28, marginTop: 24 }}>No coach applications yet.</div> : <div style={{ display: 'grid', gap: 18, marginTop: 24 }}>
          {apps.map((a) => <article key={a.id} style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 8px 30px rgba(9,35,63,.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
              <div><h2 style={{ margin: 0 }}>{a.display_name}</h2><p style={{ margin: '6px 0', fontWeight: 700 }}>{a.professional_title}</p><p style={{ margin: 0, color: '#52697e' }}>{a.country || 'Country not supplied'} · {a.timezone || 'Timezone not supplied'}</p></div>
              <strong style={{ textTransform: 'capitalize' }}>{String(a.application_status).replace('_', ' ')}</strong>
            </div>
            <p style={{ lineHeight: 1.65 }}>{a.bio || a.professional_bio}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{(a.specializations || []).map((x: string) => <span key={x} style={{ background: '#e5f3ff', padding: '6px 10px', borderRadius: 999 }}>{x}</span>)}</div>
            {a.application_status !== 'approved' && a.application_status !== 'rejected' && <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button onClick={() => review(a.id, 'approve')} style={{ border: 0, borderRadius: 9, padding: '11px 18px', background: '#0b5d9b', color: '#fff', fontWeight: 700 }}>Approve</button><button onClick={() => review(a.id, 'reject')} style={{ border: '1px solid #d2dce5', borderRadius: 9, padding: '11px 18px', background: '#fff', color: '#8a2635', fontWeight: 700 }}>Reject</button></div>}
          </article>)}
        </div>}
      </div>
    </main>
  );
}
