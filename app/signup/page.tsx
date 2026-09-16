'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';
import '../auth.css';

export default function SignupPage() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); setBusy(false); return; }
    if (password !== confirm) { setError('Passwords do not match.'); setBusy(false); return; }

    const redirectUrl = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl }
    });

    if (error) setError(error.message);
    else if (data.session) window.location.href = '/client-dashboard';
    else setMessage('Registration successful! Please check your email and click the verification link to activate your CareerDev Global account.');
    setBusy(false);
  }

  return <main className="cdg-auth-shell"><section className="cdg-auth-card">
    <Link className="cdg-auth-back" href="/">← CareerDev Global</Link>
    <h1>Create your account</h1><p>Join CareerDev Global to access career services, coaching, and your personal dashboard.</p>
    <form onSubmit={submit}>
      <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
      <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} />
      <label htmlFor="confirm">Confirm password</label><input id="confirm" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} />
      <button disabled={busy}>{busy ? 'Creating account…' : 'Create Account'}</button>
    </form>
    {message && <div className="cdg-auth-message">{message}</div>}
    {error && <div className="cdg-auth-message cdg-auth-error">{error}</div>}
    <div className="cdg-auth-footer">Already have an account? <Link href="/login">Log in</Link></div>
  </section></main>;
}
