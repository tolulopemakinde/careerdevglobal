'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';

type Payout = Record<string, any>;

export default function AdminPayoutsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage('');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      window.location.href = '/admin/login';
      return;
    }
    const { data: roleData, error: roleError } = await supabase.rpc('get_my_role');
    if (roleError || roleData?.role !== 'admin') {
      setMessage('Administrator access is required.');
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc('admin_get_platform_operations');
    if (error) setMessage(error.message);
    setPayouts((data?.payouts || []) as Payout[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function review(id: string, action: 'check' | 'approve') {
    setBusy(`${action}:${id}`);
    setMessage('');
    const { data, error } = await supabase.rpc('admin_review_marketplace_payout', {
      p_payout_id: id,
      p_action: action,
    });
    if (error) setMessage(error.message);
    else setMessage(data?.message || 'Payout updated.');
    setBusy(null);
    await load();
  }

  const button = (disabled = false) => ({
    border: '1px solid #c8d9e8',
    borderRadius: 9,
    padding: '9px 12px',
    background: disabled ? '#eef3f7' : '#fff',
    color: '#173b59',
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f8fcff,#e6f3fc)', color: '#09233f', padding: '36px 16px 70px' }}>
      <div style={{ maxWidth: 1450, margin: '0 auto' }}>
        <header style={{ background: '#fff', border: '1px solid #d8e6f1', borderRadius: 18, padding: 24, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#1671b9' }}>CareerDev Global</div>
            <h1 style={{ margin: '6px 0' }}>Coach Payout Administration</h1>
            <p style={{ margin: 0, color: '#527085', lineHeight: 1.6 }}>Run release checks and approve eligible coach payouts. Approval does not transfer funds.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="/admin" style={{ ...button(), textDecoration: 'none' }}>Back to Admin</a>
            <button onClick={load} style={button()}>Refresh</button>
          </div>
        </header>

        {message && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #c8d9e8', overflowWrap: 'anywhere' }}>{message}</div>}

        <section style={{ marginTop: 18, background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Payout queue</h2>
          {loading ? <p style={{ color: '#527085' }}>Loading payout queue…</p> : payouts.length === 0 ? <p style={{ color: '#527085' }}>No coach payouts are currently recorded.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead><tr>{['Coach','Amount','Currency','Status','Release check','Reason','Payout account','Created','Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: '2px solid #dbe6ef', fontSize: 12, color: '#607487' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {payouts.map((p) => {
                    const checkBusy = busy === `check:${p.id}`;
                    const approveBusy = busy === `approve:${p.id}`;
                    const approved = p.release_check_status === 'approved';
                    const ready = p.recipient_ready === true;
                    return <tr key={p.id}>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6' }}>{p.coach_name || p.coach_id}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6', fontWeight: 800 }}>{p.amount ?? '—'}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6' }}>{p.currency || '—'}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6' }}>{p.status || '—'}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6' }}>{p.release_check_status || 'pending'}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6', maxWidth: 280 }}>{p.release_check_reason || '—'}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6' }}>{ready ? `Verified ••••${p.account_last4 || ''}${p.bank_name ? ` • ${p.bank_name}` : ''}` : 'Not ready'}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6', whiteSpace: 'nowrap' }}>{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: 11, borderBottom: '1px solid #edf2f6' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button disabled={checkBusy || approveBusy || approved} onClick={() => review(p.id, 'check')} style={button(checkBusy || approveBusy || approved)}>{checkBusy ? 'Checking…' : 'Run check'}</button>
                          <button disabled={approveBusy || !ready || approved} onClick={() => review(p.id, 'approve')} style={button(approveBusy || !ready || approved)}>{approved ? 'Approved' : approveBusy ? 'Approving…' : 'Approve'}</button>
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ marginTop: 18, padding: 16, borderRadius: 14, background: '#fff8e8', border: '1px solid #ead6a1', color: '#624b14' }}>
          <strong>Important:</strong> This workflow performs administrative release checks and approval only. It does not call Paystack Transfers or move money. A separate, idempotent transfer step should be enabled only after the business Paystack transfer capability and payout policy are configured.
        </section>
      </div>
    </main>
  );
}
