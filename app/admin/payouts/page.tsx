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
  const [transfersEnabled, setTransfersEnabled] = useState(false);

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

  async function transfer(id: string) {
    if (!transfersEnabled) {
      setMessage('Paystack transfers are disabled by the server-side safety gate.');
      return;
    }
    if (!window.confirm('Release this approved payout through Paystack? This action initiates a financial transfer.')) return;
    setBusy(`transfer:${id}`);
    setMessage('');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      setMessage('Your admin session could not be verified.');
      setBusy(null);
      return;
    }
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/careerdev-paystack-payout-transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payout_id: id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(result?.error || 'Transfer could not be initiated.');
    else setMessage(result?.message || 'Transfer request submitted.');
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
            <p style={{ margin: 0, color: '#527085', lineHeight: 1.6 }}>Run release checks, approve eligible coach payouts, and initiate a guarded Paystack transfer.</p>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1250 }}>
                <thead><tr>{['Coach','Amount','Currency','Status','Release check','Reason','Payout account','Created','Actions'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: '2px solid #dbe6ef', fontSize: 12, color: '#607487' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {payouts.map((p) => {
                    const checkBusy = busy === `check:${p.id}`;
                    const approveBusy = busy === `approve:${p.id}`;
                    const transferBusy = busy === `transfer:${p.id}`;
                    const approved = p.release_check_status === 'approved';
                    const ready = p.recipient_ready === true;
                    const transferred = ['processing', 'paid', 'completed', 'success'].includes(String(p.status || '').toLowerCase());
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
                          <button disabled={checkBusy || approveBusy || transferBusy || approved} onClick={() => review(p.id, 'check')} style={button(checkBusy || approveBusy || transferBusy || approved)}>{checkBusy ? 'Checking…' : 'Run check'}</button>
                          <button disabled={approveBusy || transferBusy || !ready || approved} onClick={() => review(p.id, 'approve')} style={button(approveBusy || transferBusy || !ready || approved)}>{approved ? 'Approved' : approveBusy ? 'Approving…' : 'Approve'}</button>
                          <button disabled={transferBusy || !transfersEnabled || !approved || !ready || transferred} onClick={() => transfer(p.id)} style={button(transferBusy || !transfersEnabled || !approved || !ready || transferred)}>{transferred ? 'Transfer submitted' : transferBusy ? 'Releasing…' : transfersEnabled ? 'Release / Transfer' : 'Transfers disabled'}</button>
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
          <strong>Safety gate:</strong> The Release / Transfer control remains disabled until the server-side Paystack transfer feature flag is explicitly enabled. Approval alone never transfers funds.
        </section>
      </div>
    </main>
  );
}
