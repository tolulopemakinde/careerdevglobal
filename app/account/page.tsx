'use client';

import Link from 'next/link';

const accountTypes = [
  {
    title: 'Client',
    description: 'Access career services, coaching, bookings, payments, and your client dashboard.',
    login: '/client/login',
    signup: '/client/signup',
  },
  {
    title: 'Coach',
    description: 'Access your coach profile, services, availability, bookings, and marketplace tools.',
    login: '/coach/login',
    signup: '/coach/signup',
  },
];

export default function AccountPage() {
  return (
    <main className="cdg-account-page">
      <section className="cdg-account-hero">
        <Link href="/" className="cdg-account-back">← Back to CareerDev Global</Link>
        <p className="cdg-account-eyebrow">CareerDev Global</p>
        <h1>Choose your account</h1>
        <p>Select the account area that applies to you to log in or create an account.</p>
      </section>

      <section className="cdg-account-grid" aria-label="Account types">
        {accountTypes.map((account) => (
          <article className="cdg-account-card" key={account.title}>
            <div className="cdg-account-icon" aria-hidden="true">{account.title === 'Client' ? 'C' : 'Co'}</div>
            <h2>{account.title}</h2>
            <p>{account.description}</p>
            <div className="cdg-account-actions">
              <Link href={account.login} className="cdg-account-login">Log in</Link>
              <Link href={account.signup} className="cdg-account-signup">Create Account</Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
