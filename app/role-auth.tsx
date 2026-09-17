'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase-browser';

export type AccountType = 'client' | 'coach' | 'admin';
type Props = { mode: 'login' | 'signup'; accountType: AccountType };

const config = {
  client: { name: 'Client', dashboard: '/client-dashboard', signup: '/client/signup', login: '/client/login' },
  coach: { name: 'Coach', dashboard: '/coach-dashboard', signup: '/coach/signup', login: '/coach/login' },
  admin: { name: 'Staff / Admin', dashboard: '/admin', signup: '/admin/signup', login: '/admin/login' },
};

export default function RoleAuth({ mode, accountType }: Props) {
  const supabase = createSupabaseBrowserClient();
  const c = config[accountType];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');

    if (mode === 'signup') {
      if (password.length < 8) { setError('Password must be at least 8 characters.'); setBusy(false); return; }
      if (password !== confirm) { setError('Passwords do not match.'); setBusy(false); return; }
      const redirectUrl = `${window.location.origin}/auth/callback?account=${accountType}`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl, data: { requested_account_type: accountType } }
      });
      if (error) {
        setError(error.message);
      } else if (data.session) {
        window.location.href = c.dashboard;
        return;
      } else {
        // Keep only the email address locally so the callback can offer a
        // fresh verification email if an email security scanner consumes the
        // original one-time confirmation link before the user clicks it.
        try {
          window.localStorage.setItem('careerdev_signup_email', email);
          window.localStorage.setItem('careerdev_signup_account', accountType);
        } catch {}
        setMessage(accountType === 'admin'
          ? 'Account created successfully. Please check your email and click the verification link. Staff/Admin permissions are granted separately by CareerDev Global administration.'
          : accountType === 'coach'
            ? 'Account created successfully. Please check your email and click the verification link. After verification, complete the coach application and onboarding process.'
            : 'Account created successfully. Please check your email and click the verification link to activate your CareerDev Global account.');
        setPassword('');
        setConfirm('');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        const { data: roleData, error: roleError } = await supabase.rpc('get_my_role');
        const role = roleData?.role;
        const status = roleData?.status;
        if (roleError) {
          setError(`Signed in, but CareerDev Global could not verify your account permissions. ${roleError.message}`);
        } else if (status && status !== 'active') {
          setError('Your CareerDev Global account is not active. Please contact an administrator.');
        } else if (accountType === 'client') {
          window.location.href = c.dashboard;
          return;
        } else if (accountType === 'coach' && role !== 'coach') {
          setError('This account is not currently registered as a Coach. Complete the coach application and approval process first.');
        } else if (accountType === 'admin' && role !== 'admin' && role !== 'staff') {
          setError('This account does not yet have Staff/Admin permissions. Please have a platform administrator assign the appropriate role.');
        } else {
          window.location.href = c.dashboard;
          return;
        }
      }
    }
    setBusy(false);
  }

  const signupComplete = mode === 'signup' && !!message && !error;

  return <main className="cdg-auth-shell"><section className="cdg-auth-card">
    <Link className="cdg-auth-back" href="/">← CareerDev Global</Link>
    <div className="cdg-auth-role">{c.name} Account</div>
    <h1>{mode === 'login' ? `Log in as ${c.name}` : `Create a ${c.name} account`}</h1>
    <p>{accountType === 'client'
      ? 'Access career services, coaching, bookings, payments, and your personal dashboard.'
      : accountType === 'coach'
        ? 'Access coach tools, availability, service offerings, bookings, and marketplace onboarding.'
        : 'Secure access for CareerDev Global staff and administrators. Permissions are role-controlled.'}</p>

    {signupComplete ? (
      <div className="cdg-auth-success" role="status" aria-live="polite">
        <div className="cdg-auth-success-icon" aria-hidden="true">✓</div>
        <h2>Account created successfully</h2>
        <p>{message}</p>
        <p><strong>Next step:</strong> Open your email inbox, find the CareerDev Global verification email, and click the verification link.</p>
        <p>If you do not see it shortly, check your spam or junk folder.</p>
        <Link className="cdg-auth-success-button" href={c.login}>Go to Log In</Link>
      </div>
    ) : (
      <form onSubmit={submit}>
        <label htmlFor="role-email">Email address</label><input id="role-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
        <label htmlFor="role-password">Password</label><input id="role-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} />
        {mode === 'signup' && <><label htmlFor="role-confirm">Confirm password</label><input id="role-confirm" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} /></>}
        <button disabled={busy}>{busy ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : (mode === 'login' ? 'Log In' : 'Create Account')}</button>
      </form>
    )}

    {error && <div className="cdg-auth-message cdg-auth-error" role="alert">{error}</div>}
    {!signupComplete && <div className="cdg-auth-footer">{mode === 'login' ? <>Need an account? <Link href={c.signup}>Create one</Link></> : <>Already have an account? <Link href={c.login}>Log in</Link></>}</div>}
  </section></main>;
}
