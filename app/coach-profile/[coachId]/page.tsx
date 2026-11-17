'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';
import { buildRequestSlots, createSubmissionGate, dateInTimezone, safeCalendlyUrl, validTimezone } from '../../../lib/scheduling';
import type { RequestSlot, Reservation } from '../../../lib/scheduling';
import TimezoneSelect from '../../components/timezone-select';
import './styles.css';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type PendingBooking = { coachId: string; offeringId: string; date: string; startIso: string; finishIso: string; tz: string; notes: string; mode: 'coaching' | 'service' };

function safeExternalUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value.trim()); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

export default function CoachProfilePage() {
  const params = useParams<{ coachId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOffering = searchParams.get('offering');
  const supabase = createSupabaseBrowserClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [bookingMode, setBookingMode] = useState<'coaching' | 'service'>(searchParams.get('mode') === 'service' ? 'service' : 'coaching');
  const [offeringId, setOfferingId] = useState(requestedOffering || '');
  const [date, setDate] = useState('');
  const [selectedStart, setSelectedStart] = useState('');
  const [clientTimezone, setClientTimezone] = useState('UTC');
  const [now, setNow] = useState(() => new Date());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationError, setReservationError] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestNeedsReview, setRequestNeedsReview] = useState(false);
  const [pendingLoginBooking, setPendingLoginBooking] = useState(false);
  const [pending, setPending] = useState<PendingBooking | null>(null);
  const submissionGate = useRef(createSubmissionGate());
  const reviewKey = `careerdev_booking_request_review:${params.coachId}`;

  useEffect(() => {
    setClientTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setProfileError('');
    (async () => {
      try {
        const [{ data, error }, { data: bookingLinks }] = await Promise.all([
          supabase.rpc('get_public_coach_profile', { p_coach_id: params.coachId }),
          supabase.rpc('get_public_calendly_booking_links', { p_coach_id: params.coachId }),
        ]);
        if (!active) return;
        if (error) { setProfileError('The coach profile could not be loaded. Please sign in or refresh and try again.'); return; }
        if (data?.coach_id) {
          const links = new Map(Array.isArray(bookingLinks) ? bookingLinks.map((x: any) => [x.offering_id, safeCalendlyUrl(x.calendly_booking_url)]) : []);
          const merged = { ...data, offerings: (data.offerings || []).map((o: any) => ({ ...o, calendly_booking_url: links.get(o.id) || null })) };
          setProfile(merged);
          const requested = merged.offerings.find((o: any) => o.id === requestedOffering);
          if (requested) { setOfferingId(requested.id); setBookingMode(/session|coaching|coach/i.test(requested.title || '') ? 'coaching' : 'service'); }
        } else { setProfile(null); }
      } catch { if (active) setProfileError('The coach profile could not be loaded. Please refresh and try again.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [params.coachId, requestedOffering, supabase]);

  const minDate = dateInTimezone(now, clientTimezone);
  const modeOfferings = useMemo(() => (profile?.offerings || []).filter((o: any) => /session|coaching|coach/i.test(o.title || '') === (bookingMode === 'coaching')), [profile, bookingMode]);
  const selectedOffering = modeOfferings.find((o: any) => o.id === offeringId) || modeOfferings[0] || null;
  const setSelectedOffering = (offering: any) => setOfferingId(offering?.id || '');
  const setSelectedSlot = (slot: RequestSlot | null) => setSelectedStart(slot?.start.toISOString() || '');

  async function loadBooked() {
    try {
      const { data, error } = await supabase.from('marketplace_booking_slots').select('start_at,end_at').eq('coach_id', params.coachId).in('status', ['held', 'booked']);
      if (error) throw error;
      setReservations(data || []);
      setReservationError('');
    } catch { setReservationError('CareerDev reservations could not be checked. Refresh times before sending a request.'); }
  }
  useEffect(() => { void loadBooked(); }, [params.coachId]);

  useEffect(() => {
    try {
      setRequestNeedsReview(Boolean(window.sessionStorage.getItem(reviewKey)));
      const raw = window.sessionStorage.getItem('careerdev_pending_booking');
      if (!raw) return;
      const saved: PendingBooking = JSON.parse(raw);
      if (saved.coachId !== params.coachId || !validTimezone(saved.tz)) return;
      setPending(saved);
      setPendingLoginBooking(true);
      setBookingMode(saved.mode === 'service' ? 'service' : 'coaching');
      setOfferingId(saved.offeringId);
      setClientTimezone(saved.tz);
      setDate(saved.date);
      setNotes(typeof saved.notes === 'string' ? saved.notes : '');
      setSelectedStart(saved.startIso);
      setMessage('Review your saved request and choose a current time before submitting.');
    } catch { /* Ignore invalid or inaccessible saved state. */ }
  }, [params.coachId, reviewKey]);

  const slots = useMemo(() => buildRequestSlots({
    date, clientTimezone, coachTimezone: profile?.timezone || 'UTC',
    durationMinutes: Number(selectedOffering?.duration_minutes),
    availability: profile?.availability || [], reservations, now,
  }), [date, clientTimezone, profile, selectedOffering, reservations, now]);
  const selectedSlot = slots.find(slot => slot.start.toISOString() === selectedStart) || null;

  async function requestBooking() {
    await submissionGate.current.run(async () => {
      if (requestNeedsReview) return;
      setMessage('');
      if (!selectedOffering || !selectedSlot || +selectedSlot.start <= Date.now() || reservationError) {
        setMessage(reservationError || 'Choose a current service and requested time first.');
        return;
      }
      setSubmitting(true);
      let sent = false;
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError && user) throw authError;
        if (!user) {
          const saved: PendingBooking = { coachId: String(params.coachId), offeringId: selectedOffering.id, date, startIso: selectedSlot.start.toISOString(), finishIso: selectedSlot.finish.toISOString(), tz: clientTimezone, notes, mode: bookingMode };
          try { window.sessionStorage.setItem('careerdev_pending_booking', JSON.stringify(saved)); } catch { /* Login can still proceed. */ }
          router.push(`/client/login?next=${encodeURIComponent(`/coach-profile/${params.coachId}?offering=${selectedOffering.id}&mode=${bookingMode}`)}`);
          return;
        }
        const { data: client, error: clientError } = await supabase.from('clients').select('id').eq('profile_id', user.id).maybeSingle();
        if (clientError || !client) { setMessage('A client account is required before booking. Please complete client onboarding first.'); return; }
        // Persist a marker BEFORE the write so refresh cannot blindly repeat an uncertain request.
        window.sessionStorage.setItem(reviewKey, JSON.stringify({ offeringId: selectedOffering.id, start: selectedSlot.start.toISOString() }));
        sent = true;
        const { data, error } = await supabase.rpc('create_marketplace_booking_request', {
          p_client_id: client.id, p_coach_id: params.coachId, p_coach_service_offering_id: selectedOffering.id,
          p_service_request_id: null, p_start_at: selectedSlot.start.toISOString(), p_end_at: selectedSlot.finish.toISOString(),
          p_timezone: clientTimezone, p_client_notes: notes || null,
        });
        if (error) {
          if (/^[0-9A-Z]{5}$/.test(error.code || '')) {
            window.sessionStorage.removeItem(reviewKey);
            sent = false;
            setMessage('CareerDev could not save this booking request. Refresh times or contact support if the problem continues.');
            await loadBooked();
            return;
          }
          throw error;
        }
        if (!data?.id || data.booking_status !== 'requested') throw new Error('Unverified booking response');
        window.sessionStorage.removeItem(reviewKey);
        sent = false;
        window.sessionStorage.removeItem('careerdev_pending_booking');
        setPendingLoginBooking(false);
        setPending(null);
        setMessage('Request sent successfully. Your coach will review the time. Payment is available after confirmation.');
        setSelectedSlot(null);
        setNotes('');
        await loadBooked();
      } catch {
        if (sent) { setRequestNeedsReview(true); setMessage('Your request may have been saved. Check My bookings or contact support before sending another request.'); }
        else setMessage('Your request could not be sent safely. Please refresh and try again.');
      } finally { setSubmitting(false); }
    });
  }

  if (loading) return <main className="profile-page"><div className="profile-shell"><p>Loading coach profile…</p></div></main>;
  if (profileError) return <main className="profile-page"><div className="profile-shell"><h1>Coach profile unavailable</h1><p role="alert">{profileError}</p><a href="/client/login">Sign in</a></div></main>;
  if (!profile) return <main className="profile-page"><div className="profile-shell empty-profile"><h1>Coach profile unavailable</h1><p>This profile is not currently active in the CareerDev marketplace.</p><a href="/coach-matching">← Return to coach matching</a></div></main>;

  const initials = profile.display_name.split(/\s+/).map((x: string) => x[0]).slice(0, 2).join('').toUpperCase();

  return (
    <main className="profile-page">
      <header className="profile-header"><a href="/coach-matching">← Coach matching</a><a href="/">CareerDev Global</a></header>
      <section className="profile-hero">
        <div className="avatar-large">{profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name} /> : initials}</div>
        <div><p className="eyebrow">VERIFIED CAREER COACH</p><h1>{profile.display_name}</h1><p className="headline">{profile.headline || profile.professional_title || 'Career coach'}</p><p>{profile.country || 'Global'}{profile.timezone ? ` · ${profile.timezone}` : ''}</p></div>
      </section>
      <section className="profile-grid">
        <div>
          <article className="profile-card"><h2>About</h2><p>{profile.bio || profile.professional_bio || 'Professional coaching support tailored to your goals.'}</p></article>
          <article className="profile-card"><h2>Specializations</h2><div className="chips">{(profile.specializations || []).map((x: string) => <span key={x}>{x}</span>)}</div></article>
          <article className="profile-card"><h2>Professional background</h2><p>{profile.professional_bio || 'A goal-focused coaching approach designed around the client’s needs and context.'}</p><div className="meta-row"><span>{profile.years_coaching ? `${profile.years_coaching} years coaching` : 'Verified coach'}</span><span>{(profile.languages || []).join(' · ') || 'Languages available on request'}</span></div></article>
          {(safeExternalUrl(profile.linkedin_url) || safeExternalUrl(profile.website_url)) && (
            <article className="profile-card">
              <h2>Connect with this coach</h2>
              <div className="profile-external-links">
                {safeExternalUrl(profile.linkedin_url) && (
                  <a className="profile-external-button linkedin" href={safeExternalUrl(profile.linkedin_url)!} target="_blank" rel="noopener noreferrer">
                    <span aria-hidden="true">in</span> LinkedIn
                  </a>
                )}
                {safeExternalUrl(profile.website_url) && (
                  <a className="profile-external-button website" href={safeExternalUrl(profile.website_url)!} target="_blank" rel="noopener noreferrer">
                    <span aria-hidden="true">↗</span> Website
                  </a>
                )}
              </div>
            </article>
          )}
        </div>
        <aside>
          <article className="profile-card"><h2>Coaching formats</h2><div className="chips">{(profile.coaching_formats || []).map((x: string) => <span key={x}>{x}</span>)}</div><div className="verified">✓ Verified marketplace profile</div></article>
          <article className="profile-card booking-panel">
            <div className="booking-panel-head"><p className="eyebrow">BOOK WITH THIS COACH</p><h2>Choose how you’d like to work with {profile.display_name.split(' ')[0]}</h2><p>Select either a dedicated coaching session or a specific professional service.</p></div>
            <fieldset className="booking-controls" disabled={submitting || requestNeedsReview}><legend className="sr-only">Booking request details</legend><div className="booking-type-switch">
              <button type="button" className={bookingMode === 'coaching' ? 'active' : ''} onClick={() => { setBookingMode('coaching'); setSelectedSlot(null); setDate(''); setMessage(''); }}><strong>Book a Coaching Session</strong><span>One-to-one coaching focused on your goals, decisions and development.</span></button>
              <button type="button" className={bookingMode === 'service' ? 'active' : ''} onClick={() => { setBookingMode('service'); setSelectedSlot(null); setDate(''); setMessage(''); }}><strong>Book a Service</strong><span>Choose a specific professional service delivered by this coach.</span></button>
            </div>
            {modeOfferings.length ? (
              <>
                <div className="booking-context"><span>{bookingMode === 'coaching' ? 'COACHING SESSION' : 'PROFESSIONAL SERVICE'}</span><strong>{bookingMode === 'coaching' ? 'Select your coaching session' : 'Select the service you need'}</strong></div>
                {selectedOffering?.calendly_booking_url && !submitting && !requestNeedsReview && <div className="calendly-direct-booking"><a href={selectedOffering.calendly_booking_url} target="_blank" rel="noopener noreferrer">Direct Calendly fallback →</a><p>Booking completes on Calendly. It will not be recorded or paid through CareerDev’s marketplace flow. Choose one booking route to avoid duplicate requests.</p></div>}
                <div className="booking-step"><span>1</span><div><strong id="booking-service-label">{bookingMode === 'coaching' ? 'Choose a coaching session' : 'Choose a service'}</strong><label><select aria-labelledby="booking-service-label" value={selectedOffering?.id || ''} onChange={(e) => { setSelectedOffering(modeOfferings.find((o: any) => o.id === e.target.value) || null); setSelectedSlot(null); }}>{modeOfferings.map((o: any) => <option value={o.id} key={o.id}>{o.title} · {o.duration_minutes} min{o.price != null ? ` · ${o.currency} ${o.price}` : ''}</option>)}</select></label></div></div>
                <div className="booking-step"><span>2</span><div><strong>Choose a date in your timezone</strong><TimezoneSelect value={clientTimezone} onChange={(tz) => { if (validTimezone(tz)) { setClientTimezone(tz); setSelectedSlot(null); } }} label="Your timezone" required /><label><span className="sr-only">Requested date</span><input type="date" min={minDate} value={date} onChange={(e) => { setDate(e.target.value); setSelectedSlot(null); }} /></label></div></div>
                {date && <div className="booking-step"><span>3</span><div><strong>Choose a requested time</strong><p className="booking-help">Times are shown in {clientTimezone}. These suggestions use the coach’s published hours, not live Calendly availability. Your coach must confirm the appointment.</p>{reservationError && <p role="alert">{reservationError}</p>}<button type="button" className="refresh-times" onClick={() => { setNow(new Date()); void loadBooked(); }}>Refresh times</button><div className="availability-list">{slots.length ? slots.map((s: any) => <button type="button" aria-pressed={selectedSlot?.start.toISOString() === s.start.toISOString()} className={selectedSlot?.start.toISOString() === s.start.toISOString() ? 'booking-slot selected' : 'booking-slot'} key={s.start.toISOString()} onClick={() => setSelectedSlot(s)}>{s.label}</button>) : <p>No requested times fit this date. Try another date or use the direct Calendly fallback if offered.</p>}</div></div></div>}
                <div className="booking-step"><span>4</span><div><strong>Tell the coach what you want to work on <em>(optional)</em></strong><textarea aria-label="Notes for your coach" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={bookingMode === 'coaching' ? 'Example: I’d like support preparing for an upcoming career transition.' : 'Example: I need help improving my LinkedIn profile.'} /></div></div>
                {selectedSlot && <div className="booking-summary"><strong>{bookingMode === 'coaching' ? 'Coaching session' : 'Service'} selected</strong><span>{selectedOffering.title} · {selectedSlot.label}</span></div>}
                {pending && !selectedSlot && <p role="status">The saved time is no longer selectable. Choose a current requested time.</p>}
                {message && <div role="status" aria-live="polite" className={message.includes('sent successfully') ? 'booking-success' : 'dash-message'}>{message}</div>}
                <button className="booking-button" disabled={submitting || requestNeedsReview || Boolean(reservationError) || !selectedSlot} onClick={requestBooking}>{submitting ? 'Sending request…' : pendingLoginBooking ? 'Complete booking request' : bookingMode === 'coaching' ? 'Request coaching session' : 'Request this service'}</button>
                {requestNeedsReview && <p role="alert">This request needs review. <a href="/client-dashboard#bookings">Check My bookings</a> or contact support before sending another request.</p>}<p className="note">Your request is not confirmed until the coach accepts it. You will be able to pay securely after confirmation.</p>
              </>
            ) : (
              <div className="directory-empty"><h3>{bookingMode === 'coaching' ? 'No coaching session is currently published.' : 'No service is currently published.'}</h3><p>Choose the other booking option above or check back later.</p></div>
            )}
          </fieldset></article>
          <article className="profile-card"><h2>Published coach hours</h2>{profile.availability?.length ? <div className="availability-list">{profile.availability.map((a: any) => <div key={`${a.day_of_week}-${a.start_time}`}><strong>{days[a.day_of_week]}</strong><span>{String(a.start_time).slice(0, 5)}–{String(a.end_time).slice(0, 5)} · {a.timezone}</span></div>)}</div> : <p>Availability is currently being updated.</p>}</article>
          <article className="profile-card"><h2>Credentials</h2>{profile.credentials?.length ? <ul>{profile.credentials.map((x: string) => <li key={x}>{x}</li>)}</ul> : <p>Credentials available during coach review.</p>}</article>
        </aside>
      </section>
    </main>
  );
}
