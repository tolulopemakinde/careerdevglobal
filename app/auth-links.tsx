'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase-browser';

export default function AuthLinks() {
  const [signedIn, setSignedIn] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  if (signedIn) {
    return (
      <div className="cdg-auth-links">
        <Link href="/client-dashboard">Dashboard</Link>
        <button
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = '/';
          }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="cdg-auth-links">
      <Link href="/login">Log In</Link>
      <Link href="/signup" className="cdg-auth-primary">Create Account</Link>
    </div>
  );
}
