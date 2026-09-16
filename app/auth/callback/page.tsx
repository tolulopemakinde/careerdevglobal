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
      const code = new URLSearchParams(window.location.search).get('code');
      if (!code) {
        if (mounted) setError('The verification link is missing or invalid. Please request a new verification email.');
        return;
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        if (mounted) setError('This verification link has expired or has already been used. Please request a new verification email.');
        return;
      }

      router.replace('/client-dashboard');
      router.refresh();
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
          <><h1 style={{color:'#063b5c'}}>Verification link issue</h1><p style={{color:'#527085'}}>{error}</p><a href="/login" style={{display:'inline-block',marginTop:12,padding:'12px 18px',borderRadius:10,background:'#0879ad',color:'#fff',textDecoration:'none',fontWeight:800}}>Go to Login</a></>
        )}
      </section>
    </main>
  );
}
