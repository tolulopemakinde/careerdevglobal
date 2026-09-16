'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase-browser';

const accountGroups = [
  { label: 'Clients', login: '/client/login', signup: '/client/signup' },
  { label: 'Coaches', login: '/coach/login', signup: '/coach/signup' },
  { label: 'Staff / Admin', login: '/admin/login', signup: '/admin/signup' },
];

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
      {signedIn ? (
        <div className="cdg-user-nav-inner cdg-user-nav-signed-in">
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
      ) : (
        <div className="cdg-user-nav-inner">
          {accountGroups.map((group) => (
            <div className="cdg-account-group" key={group.label}>
              <span>{group.label}</span>
              <Link href={group.login}>Login</Link>
              <Link href={group.signup} className="cdg-account-create">Create Account</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
