'use client';

import { FormEvent, useEffect, useState } from "react";
import "./styles.css";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

const specialties = ["Career transition", "Leadership", "Executive coaching", "Interview coaching", "CV & LinkedIn", "Job search", "Product management", "Entrepreneurship", "Youth career development"];
const formats = ["Structured", "Conversational", "Goal-based", "Group coaching"];

export default function CoachRegistration() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    display_name: "", headline: "", bio: "", professional_title: "", professional_bio: "",
    specializations: [] as string[], coaching_formats: ["Structured"] as string[], languages: "English",
    methodology: "", credentials: "", years_experience: "", coaching_experience_years: "", country: "",
    timezone: "", linkedin_url: "", website_url: "", availability_summary: "", agreements: false,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => { setUserId(data.user?.id ?? null); setChecking(false); });
  }, []);

  const update = (key: string, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const toggle = (key: "specializations" | "coaching_formats", value: string) => setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!userId) return setError("Please sign in to submit a coach application.");
    if (!form.display_name.trim() || !form.headline.trim() || !form.bio.trim() || !form.specializations.length || !form.coaching_formats.length || !form.agreements) {
      return setError("Please complete the required profile fields and accept the marketplace agreements.");
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("coach_marketplace_applications").insert({
        applicant_user_id: userId,
        display_name: form.display_name.trim(), headline: form.headline.trim(), bio: form.bio.trim(),
        professional_title: form.professional_title.trim() || null, professional_bio: form.professional_bio.trim() || null,
        specializations: form.specializations, coaching_formats: form.coaching_formats,
        languages: form.languages.split(",").map(x => x.trim()).filter(Boolean), methodology: form.methodology.trim() || null,
        credentials: form.credentials.split(",").map(x => x.trim()).filter(Boolean),
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        coaching_experience_years: form.coaching_experience_years ? Number(form.coaching_experience_years) : null,
        country: form.country.trim() || null, timezone: form.timezone.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null, website_url: form.website_url.trim() || null,
        availability_summary: form.availability_summary.trim() || null,
        required_agreements_accepted: true, agreements_accepted_at: new Date().toISOString(), application_status: "submitted"
      });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err) { setError(err instanceof Error ? err.message : "We could not submit your application."); }
  };

  if (checking) return <main className="registration-page"><div className="registration-card"><p>Checking your account…</p></div></main>;

  return <main className="registration-page">
    <header><a href="/coach-matching">← Coach matching</a><span>CareerDev Global</span></header>
    <section className="registration-hero"><div><p className="eyebrow">COACH MARKETPLACE</p><h1>Apply to coach with CareerDev Global.</h1><p>Build a professional marketplace profile, complete our review process, and become discoverable when your profile, eligibility and availability are active.</p></div></section>
    {!userId && <div className="notice"><strong>Sign in required.</strong><p>Coach applications are tied to an authenticated account so you can manage your profile and application status securely.</p></div>}
    {submitted ? <section className="success"><h2>Application submitted</h2><p>Your application is now in review. Marketplace visibility is not automatic: approval, onboarding, eligibility and active availability are required before you can appear in coach matching.</p><a href="/coach-matching">Return to coach matching →</a></section> : <form className="registration-card" onSubmit={submit}>
      <div className="section"><h2>Professional profile</h2><p className="hint">These details form the foundation of your public marketplace profile.</p><div className="two"><Field label="Display name *" value={form.display_name} onChange={v => update("display_name", v)} /><Field label="Professional headline *" value={form.headline} onChange={v => update("headline", v)} /></div><Field label="Short coach bio *" value={form.bio} onChange={v => update("bio", v)} area /><div className="two"><Field label="Professional title" value={form.professional_title} onChange={v => update("professional_title", v)} /><Field label="Country" value={form.country} onChange={v => update("country", v)} /></div><div className="two"><Field label="Timezone" value={form.timezone} onChange={v => update("timezone", v)} /><Field label="Languages (comma separated)" value={form.languages} onChange={v => update("languages", v)} /></div></div>
      <div className="section"><h2>Coaching expertise</h2><label>Specializations *</label><div className="chips">{specialties.map(x => <button type="button" className={form.specializations.includes(x) ? "chip active" : "chip"} onClick={() => toggle("specializations", x)} key={x}>{x}</button>)}</div><label>Coaching formats *</label><div className="chips">{formats.map(x => <button type="button" className={form.coaching_formats.includes(x) ? "chip active" : "chip"} onClick={() => toggle("coaching_formats", x)} key={x}>{x}</button>)}</div><Field label="Coaching methodology" value={form.methodology} onChange={v => update("methodology", v)} area /><div className="two"><Field label="Years of professional experience" value={form.years_experience} onChange={v => update("years_experience", v)} type="number" /><Field label="Years of coaching experience" value={form.coaching_experience_years} onChange={v => update("coaching_experience_years", v)} type="number" /></div><Field label="Credentials / certifications (comma separated)" value={form.credentials} onChange={v => update("credentials", v)} /></div>
      <div className="section"><h2>Professional links & availability</h2><div className="two"><Field label="LinkedIn URL" value={form.linkedin_url} onChange={v => update("linkedin_url", v)} /><Field label="Website URL" value={form.website_url} onChange={v => update("website_url", v)} /></div><Field label="Availability summary" value={form.availability_summary} onChange={v => update("availability_summary", v)} area placeholder="Example: Weekdays, 17:00–21:00 WAT; Saturday mornings." /></div>
      <div className="agreement"><input id="agreements" type="checkbox" checked={form.agreements} onChange={e => update("agreements", e.target.checked)} /><label htmlFor="agreements">I agree to CareerDev Global's coach marketplace terms, professional standards and review process. *</label></div>
      {error && <div className="error">{error}</div>}
      <button className="submit" type="submit" disabled={!userId}>Submit coach application</button>
      <p className="footnote">Submitting an application does not guarantee marketplace approval or activation.</p>
    </form>}
  </main>;
}

function Field({ label, value, onChange, area = false, type = "text", placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; area?: boolean; type?: string; placeholder?: string }) {
  return <label className="field">{label}{area ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}</label>;
}
