'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Application = {
  id: string;
  application_status: string;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
};

const statusCopy: Record<string, { title: string; text: string }> = {
  submitted: { title: 'Application submitted', text: 'Your coach application has been received and is awaiting CareerDev Global review.' },
  pending: { title: 'Application pending', text: 'Your coach application is in the CareerDev Global review queue.' },
  under_review: { title: 'Application under review', text: 'CareerDev Global is reviewing your coach application. We will update your account when a decision is recorded.' },
  approved: { title: 'Application approved', text: 'Your coach application has been approved. Complete any remaining marketplace onboarding requirements before activation.' },
  rejected: { title: 'Application not approved', text: 'Your previous coach application was not approved. You may review your information and submit a new application.' },
};

export default function CoachAccountPage() {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const user = authData.user;
      if (authError || !user) {
        if (mounted) { setError('Please sign in to access your Coach Account.'); setLoading(false); }
        return;
      }
      const { data, error: applicationError } = await supabase
        .from('coach_marketplace_applications')
        .select('id,application_status,created_at,reviewed_at,review_notes')
        .eq('applicant_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mounted) {
        setEmail(user.email || '');
        setName([user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Coach');
        setApplication(applicationError ? null : data);
        if (applicationError) setError('We could not load your coach application status. Please refresh and try again.');
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [supabase]);

  if (loading) return <main className="cdg-coach-account"><section className="cdg-coach-account-card"><p>Loading your Coach Account…</p></section></main>;

  if (error && !email) return <main className="cdg-coach-account"><section className="cdg-coach-account-card"><h1>Coach Account</h1><p>{error}</p><Link className="cdg-coach-account-primary" href="/coach/login">Go to Coach Login</Link></section></main>;

  const status = application?.application_status?.toLowerCase() || '';
  const copy = statusCopy[status];

  return (
    <main className="cdg-coach-account">
      <section className="cdg-coach-account-card">
        <Link href="/" className="cdg-coach-account-back">← CareerDev Global</Link>
        <p className="cdg-coach-account-eyebrow">COACH ACCOUNT</p>
        <h1>Welcome, {name}</h1>
        <p className="cdg-coach-account-intro">Manage your CareerDev Global coach journey from one place.</p>
        {error && <div className="cdg-coach-account-alert" role="alert">{error}</div>}
        {!application && (
          <section className="cdg-coach-account-panel">
            <span className="cdg-coach-account-badge">Next step</span>
            <h2>Apply to coach with CareerDev Global</h2>
            <p>Your CareerDev Global account is ready. To be considered for the coach marketplace, complete your coach application with your professional profile, expertise, coaching approach and required agreements.</p>
            <Link className="cdg-coach-account-primary" href="/coach-registration">Apply to Coach with CareerDev Global →</Link>
          </section>
        )}
        {application && (
          <section className="cdg-coach-account-panel">
            <span className="cdg-coach-account-badge">Application status</span>
            <h2>{copy?.title || 'Application status: ' + application.application_status}</h2>
            <p>{copy?.text || 'Your coach application status is recorded on your CareerDev Global account.'}</p>
            <div className="cdg-coach-account-status"><strong>{application.application_status}</strong><span>Submitted {new Date(application.created_at).toLocaleDateString()}</span></div>
            {application.review_notes && <div className="cdg-coach-account-review"><strong>Review note</strong><p>{application.review_notes}</p></div>}
            {status === 'rejected' ? (
              <Link className="cdg-coach-account-primary" href="/coach-registration">Submit a New Coach Application →</Link>
            ) : status === 'approved' ? (
              <Link className="cdg-coach-account-primary" href="/coach-dashboard">Open Coach Dashboard →</Link>
            ) : (
              <Link className="cdg-coach-account-secondary" href="/coach-registration">View Coach Application →</Link>
            )}
          </section>
        )}
        <div className="cdg-coach-account-meta">
          <span><strong>Email</strong>{email}</span>
          <Link href="/coach-dashboard">Coach Dashboard</Link>
        </div>
      </section>
    </main>
  );
}
