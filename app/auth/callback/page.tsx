'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();

    async function completeVerification() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type') || 'email';
      const code = params.get('code');
      const accountParam = params.get('account');

      try {
        setEmail(window.localStorage.getItem('careerdev_signup_email') || '');
      } catch {}

      let verificationError: string | null = null;

      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'email',
        });
        if (verifyError) verificationError = verifyError.message;
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) verificationError = exchangeError.message;
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          verificationError = 'The verification link is missing or could not be completed.';
        }
      }

      if (verificationError) {
        if (mounted) {
          setError('We could not complete the verification automatically. If you just clicked the CareerDev Global email, the link may already have been used or may have been opened by an email security scanner. You can request a fresh verification email below.');
        }
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const account = accountParam || userData.user?.user_metadata?.requested_account_type;
      const destination = account === 'coach'
        ? '/coach-registration'
        : account === 'admin'
          ? '/admin/login'
          : '/client-dashboard';

      try {
        window.localStorage.removeItem('careerdev_signup_email');
        window.localStorage.removeItem('careerdev_signup_account');
      } catch {}

      if (mounted) {
        router.replace(destination);
        router.refresh();
      }
    }

    completeVerification();
    return () => { mounted = false; };
  }, [router]);

  async function resendVerification() {
    if (!email) {
      setError('We do not have the email address used for this signup. Please return to the registration page and create/request a new verification email.');
      return;
    }

    setResending(true);
    setResent(false);
    const supabase = createSupabaseBrowserClient();
    const account = (() => {
      try { return window.localStorage.getItem('careerdev_signup_account') || 'client'; } catch { return 'client'; }
    })();
    const redirectUrl = `${window.location.origin}/auth/callback?account=${account}`;
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectUrl },
    });

    if (resendError) {
      setError(resendError.message);
    } else {
      setResent(true);
      setError('');
    }
    setResending(false);
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#eef8fd'}}>
      <section style={{width:'min(560px,100%)',background:'#fff',borderRadius:20,padding:32,boxShadow:'0 16px 50px rgba(0,60,100,.12)',textAlign:'center'}}>
        {!error ? (
          <><h1 style={{color:'#063b5c'}}>Verifying your account…</h1><p style={{color:'#527085'}}>Please wait while we securely complete your email verification.</p></>
        ) : (
          <>
            <h1 style={{color:'#063b5c'}}>Email verification</h1>
            <p style={{color:'#527085',lineHeight:1.6}}>{error}</p>
            {email && <button type="button" onClick={resendVerification} disabled={resending} style={{marginTop:12,padding:'12px 18px',border:0,borderRadius:10,background:'#0879ad',color:'#fff',fontWeight:800,cursor:resending?'wait':'pointer'}}>{resending ? 'Sending…' : 'Send New Verification Email'}</button>}
            {resent && <p role="status" style={{marginTop:14,color:'#237a4b',fontWeight:700}}>A new verification email has been sent. Please use the newest email and click its link once.</p>}
            <div style={{marginTop:16}}><a href="/client/login" style={{color:'#0879ad',fontWeight:800}}>Go to Login</a></div>
          </>
        )}
      </section>
    </main>
  );
}
