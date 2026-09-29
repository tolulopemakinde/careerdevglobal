import { NextRequest, NextResponse } from 'next/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim().slice(0, 80) : '';
    const lastName = typeof body?.lastName === 'string' ? body.lastName.trim().slice(0, 80) : '';
    const role = body?.role === 'coach' ? 'coach' : body?.role === 'client' ? 'client' : null;

    if (!role || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Valid pilot signup details are required.' }, { status: 400 });
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      console.warn('BREVO_API_KEY is not configured; pilot opt-in was recorded in the user account metadata but not synced to Brevo.');
      return NextResponse.json({ ok: true, brevoSynced: false, reason: 'brevo_not_configured' });
    }

    const listId = role === 'client' ? 4 : 5;
    const templateId = role === 'client' ? 7 : 8;

    const attributes: Record<string, string> = {};
    if (firstName) attributes.FIRSTNAME = firstName;
    if (lastName) attributes.LASTNAME = lastName;

    const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds: [listId],
        updateEnabled: true,
      }),
      cache: 'no-store',
    });

    if (!contactResponse.ok) {
      const payload = await contactResponse.json().catch(() => ({}));
      console.error('Brevo pilot contact sync failed:', payload);
      return NextResponse.json({ error: 'Brevo contact sync failed.' }, { status: 502 });
    }

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: [{ email, name: [firstName, lastName].filter(Boolean).join(' ') || email }],
        templateId,
        params: { FIRSTNAME: firstName, LASTNAME: lastName },
        tags: ['careerdev-global-pilot', role + '-pilot'],
      }),
      cache: 'no-store',
    });

    if (!emailResponse.ok) {
      const payload = await emailResponse.json().catch(() => ({}));
      console.error('Brevo pilot welcome email failed:', payload);
      return NextResponse.json({ ok: true, brevoSynced: true, welcomeEmailSent: false });
    }

    return NextResponse.json({ ok: true, brevoSynced: true, welcomeEmailSent: true });
  } catch (error) {
    console.error('Pilot opt-in route error:', error);
    return NextResponse.json({ error: 'Pilot signup could not be completed.' }, { status: 500 });
  }
}
