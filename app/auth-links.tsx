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

  return (
    <div className="cdg-user-nav" aria-label="Account navigation">
      <div className={`cdg-user-nav-inner ${signedIn ? 'cdg-user-nav-signed-in' : ''}`}>
        {signedIn ? (
          <>
            <Link href="/account">Account</Link>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/';
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <Link href="/account" className="cdg-account-entry">
            Log in / Create Account
          </Link>
        )}
      </div>
    </div>
  );
}
