'use client';

import { useState, type FormEvent } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

export default function SupportPage() {
  const supabase = createSupabaseBrowserClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('careerdev-support-ticket', {
        body: { subject, description },
      });
      if (error) throw error;
      const result = data as { priority_tier?: string } | null;
      setMessage('Support request created successfully. Priority: ' + (result?.priority_tier ?? 'standard') + '.');
      setSubject('');
      setDescription('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the support request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '40px 16px', background: '#f7fbff', color: '#09233f' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <a href="/" style={{ color: '#176da9', fontWeight: 800, textDecoration: 'none' }}>← CareerDev Global</a>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', margin: '28px 0 8px' }}>CareerDev Global Support</h1>
        <p style={{ color: '#527085', lineHeight: 1.6 }}>
          Submit a support request. Your active subscription determines the support routing tier automatically.
        </p>

        {message && (
          <div style={{ margin: '20px 0', padding: 14, borderRadius: 12, background: '#fff4e5', border: '1px solid #f0c36a' }}>
            {message}
          </div>
        )}

        <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #d8e6f1', borderRadius: 18, padding: 22, display: 'grid', gap: 14 }}>
          <label>
            <strong>Subject</strong>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              style={{ display: 'block', width: '100%', marginTop: 6, padding: 13, border: '1px solid #c8d9e8', borderRadius: 10 }}
            />
          </label>
          <label>
            <strong>Description</strong>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              rows={7}
              style={{ display: 'block', width: '100%', marginTop: 6, padding: 13, border: '1px solid #c8d9e8', borderRadius: 10, resize: 'vertical' }}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            style={{ padding: '12px 16px', border: 0, borderRadius: 10, background: '#0b5d9b', color: '#fff', fontWeight: 900 }}
          >
            {busy ? 'Submitting…' : 'Submit support request'}
          </button>
        </form>
      </div>
    </main>
  );
}
