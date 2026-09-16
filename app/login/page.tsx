'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';
import '../auth.css';

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = '/client-dashboard';
    setBusy(false);
  }

  return <main className="cdg-auth-shell"><section className="cdg-auth-card">
    <Link className="cdg-auth-back" href="/">← CareerDev Global</Link>
    <h1>Welcome back</h1><p>Log in to access your CareerDev Global account and dashboard.</p>
    <form onSubmit={submit}>
      <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
      <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} />
      <button disabled={busy}>{busy ? 'Logging in…' : 'Log In'}</button>
    </form>
    {message && <div className="cdg-auth-message">{message}</div>}
    {error && <div className="cdg-auth-message cdg-auth-error">{error}</div>}
    <div className="cdg-auth-footer">Don't have an account? <Link href="/signup">Create one</Link></div>
  </section></main>;
}
