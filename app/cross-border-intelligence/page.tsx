'use client';

import { useState, type FormEvent } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type CrossBorderForm = Record<string, string>;

export default function CrossBorderIntelligencePage() {
  const supabase = createSupabaseBrowserClient();
  const [form, setForm] = useState<CrossBorderForm>({
    target_country: '',
    origin_country: '',
    target_role: '',
    present_role: '',
    relocation_intent: '',
    work_authorization_context: '',
    request_details: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');

  const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setRequestId('');
    try {
      const { data, error } = await supabase.functions.invoke('careerdev-cross-border-intelligence', { body: form });
      if (error) throw error;
      setRequestId(String(data?.request_id ?? ''));
      setMessage('Your Cross-Border Career Intelligence request has been queued for processing.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This feature requires an active eligible subscription.');
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    ['origin_country', 'Current country'],
    ['target_country', 'Target country'],
    ['present_role', 'Current role'],
    ['target_role', 'Target role'],
    ['relocation_intent', 'Relocation intent'],
    ['work_authorization_context', 'Work-authorization context'],
  ];

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f7fbff,#eef6fb)', color: '#09233f', padding: '40px 16px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <a href="/" style={{ color: '#176da9', fontWeight: 800, textDecoration: 'none' }}>← CareerDev Global</a>
        <header style={{ margin: '28px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.2, color: '#1671b9' }}>ELITE CAREER INTELLIGENCE</div>
          <h1 style={{ fontSize: 'clamp(2rem,5vw,3.3rem)', margin: '8px 0' }}>Cross-Border Career Intelligence</h1>
          <p style={{ color: '#527085', lineHeight: 1.65 }}>Submit an international career question covering target markets, roles, relocation context and work-authorization considerations. AI processing is governed and consequential outputs remain subject to human review.</p>
        </header>
        {message && <div role="status" style={{ padding: 14, marginBottom: 16, borderRadius: 12, background: '#fff4e5', border: '1px solid #f0c36a', color: '#684b00' }}>{message}</div>}
        {requestId && <div style={{ padding: 14, marginBottom: 16, borderRadius: 12, background: '#edf8f1', border: '1px solid #b9dfc4' }}><strong>Request ID:</strong> {requestId}</div>}
        <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #d8e6f1', borderRadius: 18, padding: 22, display: 'grid', gap: 14 }}>
          {fields.map(([key, label]) => <input key={key} value={form[key]} onChange={event => update(key, event.target.value)} placeholder={label} required={key === 'target_country'} style={{ padding: 13, border: '1px solid #c8d9e8', borderRadius: 10 }} />)}
          <textarea value={form.request_details} onChange={event => update('request_details', event.target.value)} placeholder="What would you like CareerDev Global to analyse?" rows={7} style={{ padding: 13, border: '1px solid #c8d9e8', borderRadius: 10, resize: 'vertical' }} />
          <button type="submit" disabled={busy} style={{ padding: '12px 16px', border: 0, borderRadius: 10, background: '#0b5d9b', color: '#fff', fontWeight: 900 }}>{busy ? 'Submitting…' : 'Request Cross-Border Intelligence'}</button>
        </form>
        <p style={{ fontSize: 12, color: '#718394', lineHeight: 1.6, marginTop: 16 }}>Career intelligence is decision support. It does not guarantee employment, immigration approval, salary, or other outcomes. Verify current legal and market information before making consequential decisions.</p>
      </div>
    </main>
  );
}
