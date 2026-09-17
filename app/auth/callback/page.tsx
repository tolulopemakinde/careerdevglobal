'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();

    async function completeVerification() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type') || 'email';
      const code = params.get('code');

      let verificationError: string | null = null;

      // Preferred flow: verify the one-time token hash directly. This avoids
      // PKCE browser/device coupling when the user opens the email on another
      // browser or device.
      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'email',
        });
        if (verifyError) verificationError = verifyError.message;
      } else if (code) {
        // Backward-compatible support for confirmation emails already sent
        // using the PKCE authorization-code flow.
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) verificationError = exchangeError.message;
      } else {
        // Some client-side Supabase flows return the session in the URL hash.
        // Give the browser client a chance to process it before declaring an error.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          verificationError = 'The verification link is missing or invalid.';
        }
      }

      if (verificationError) {
        if (mounted) {
          setError('We could not complete this verification link. It may have expired or already been used. Please request a new verification email.');
        }
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const account = userData.user?.user_metadata?.requested_account_type;
      const destination = account === 'coach'
        ? '/coach-registration'
        : account === 'admin'
          ? '/admin/login'
          : '/client-dashboard';

      if (mounted) {
        router.replace(destination);
        router.refresh();
      }
    }

    completeVerification();
    return () => { mounted = false; };
  }, [router]);

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#eef8fd'}}>
      <section style={{width:'min(520px,100%)',background:'#fff',borderRadius:20,padding:32,boxShadow:'0 16px 50px rgba(0,60,100,.12)',textAlign:'center'}}>
        {!error ? (
          <><h1 style={{color:'#063b5c'}}>Verifying your account…</h1><p style={{color:'#527085'}}>Please wait while we securely complete your email verification.</p></>
        ) : (
          <><h1 style={{color:'#063b5c'}}>Verification link issue</h1><p style={{color:'#527085'}}>{error}</p><a href="/client/login" style={{display:'inline-block',marginTop:12,padding:'12px 18px',borderRadius:10,background:'#0879ad',color:'#fff',textDecoration:'none',fontWeight:800}}>Go to Login</a></>
        )}
      </section>
    </main>
  );
}
