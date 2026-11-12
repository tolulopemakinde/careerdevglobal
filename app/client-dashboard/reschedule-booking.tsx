'use client';

import { useRef, useState } from 'react';
import { createSubmissionGate } from '../../lib/scheduling';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

const projectRef = process.env.NEXT_PUBLIC_CALENDLY_RESCHEDULE_REHEARSAL_PROJECT_REF;
export const rescheduleRehearsalEnabled = Boolean(
  projectRef && /^[a-z0-9]{20}$/.test(projectRef) &&
  !['ufmhrmzumqkjvaezrmxf', 'yyevuwvtrktrzwuzeddo'].includes(projectRef) &&
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://' + projectRef + '.supabase.co',
);

type RescheduleBookingProps = {
  bookingId: string;
  onRescheduled: () => Promise<void>;
};

export default function RescheduleBooking({ bookingId, onRescheduled }: RescheduleBookingProps) {
  const gate = useRef(createSubmissionGate());
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function checkCalendly() {
    await gate.current.run(async () => {
      setBusy(true);
      setMessage('');
      setUrl(null);
      try {
        const { data, error } = await createSupabaseBrowserClient().functions.invoke(
          'careerdev-calendly-reschedule',
          { body: { booking_id: bookingId } },
        );
        if (error) throw error;
        if (data?.state === 'rescheduled') {
          setMessage('Calendly confirmed the new time.');
          await onRescheduled();
        } else if (data?.state === 'active' && typeof data.url === 'string' &&
          /^https:\/\/calendly[.]com\/reschedulings\/[A-Za-z0-9-]+$/.test(data.url)) {
          setUrl(data.url);
        } else {
          throw new Error('Unexpected reschedule response');
        }
      } catch {
        setMessage('CareerDev could not verify the booking in Calendly. If you already changed the time, contact support.');
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div>
      {url && <p><a href={url} target="_blank" rel="noreferrer">Change time in Calendly (opens a new tab)</a></p>}
      <button type="button" className="text-button" disabled={busy} onClick={checkCalendly}>
        {busy ? 'Checking Calendly…' : url ? 'Check for new time' : 'Reschedule with Calendly'}
      </button>
      {message && <p role="status">{message}</p>}
      <p>Contact your coach to cancel.</p>
    </div>
  );
}
