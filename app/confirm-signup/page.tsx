'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

export default function ConfirmSignupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirmEmail() {
    setBusy(true);
    setError('');

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type') || 'email';

    if (!tokenHash) {
      setError('This confirmation link is missing the verification token. Please request a new verification email.');
      setBusy(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'email',
    });

    if (verifyError) {
      setError('This verification link has expired or has already been used. Please request a new verification email.');
      setBusy(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const account = userData.user?.user_metadata?.requested_account_type;
    const destination = account === 'coach'
      ? '/coach-registration'
      : account === 'admin'
        ? '/admin/login'
        : '/client-dashboard';

    router.replace(destination);
    router.refresh();
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#eef8fd'}}>
      <section style={{width:'min(560px,100%)',background:'#fff',borderRadius:20,padding:36,boxShadow:'0 16px 50px rgba(0,60,100,.12)',textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:12}} aria-hidden="true">✉️</div>
        <h1 style={{color:'#063b5c',marginBottom:12}}>Confirm your email</h1>
        <p style={{color:'#527085',lineHeight:1.6}}>Your CareerDev Global account has been created. Click the button below to confirm your email address.</p>
        <button
          type="button"
          onClick={confirmEmail}
          disabled={busy}
          style={{marginTop:18,padding:'13px 22px',border:0,borderRadius:10,background:'#0879ad',color:'#fff',fontWeight:800,cursor:busy?'wait':'pointer'}}
        >
          {busy ? 'Confirming email…' : 'Confirm Email'}
        </button>
        {error && <p role="alert" style={{marginTop:18,color:'#a33b3b'}}>{error}</p>}
      </section>
    </main>
  );
}
