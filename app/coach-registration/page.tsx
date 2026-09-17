'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import "./styles.css";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type Category = { id: string; name: string; description: string | null; sort_order: number };
type Specialization = { id: string; category_id: string; name: string; description: string | null; sort_order: number };

const formats = ["Structured", "Conversational", "Goal-based", "Group coaching", "Team coaching", "Virtual coaching"];
const clientGroups = ["Students", "Graduates", "Early-career professionals", "Mid-career professionals", "Senior professionals", "Executives", "Entrepreneurs", "Founders", "Managers", "Leaders", "Career changers", "Job seekers", "International professionals", "Migrants", "Youth"];
const careerStages = ["Student", "Graduate", "Early career", "Mid career", "Senior career", "Executive", "Career transition", "Career re-entry", "Entrepreneurial"];
const industries = ["Technology & AI", "Education", "Healthcare", "Finance", "Human Resources", "NGO & Development", "Public Sector", "Legal", "Engineering", "Creative Industries", "Media & Communications", "Nonprofit & Social Impact", "Professional Services", "Entrepreneurship"];
const approaches = ["ICF-aligned coaching", "Strengths-based", "Solution-focused", "Evidence-informed", "Transformational", "Developmental", "Systems coaching", "Positive-psychology-informed", "Experiential", "Performance coaching", "Group coaching", "Team coaching"];

export default function CoachRegistration() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(true);
  const [form, setForm] = useState({
    display_name: "", headline: "", bio: "", professional_title: "", professional_bio: "",
    expertise_category_ids: [] as string[], expertise_specialization_ids: [] as string[], coaching_formats: ["Structured"] as string[],
    target_client_groups: [] as string[], career_stages: [] as string[], industries: [] as string[], coaching_approaches: [] as string[],
    languages: "English", methodology: "", credentials: "", years_experience: "", coaching_experience_years: "", country: "",
    timezone: "", linkedin_url: "", website_url: "", availability_summary: "", agreements: false,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    Promise.all([
      supabase.auth.getUser(),
      supabase.from("coaching_expertise_categories").select("id,name,description,sort_order").eq("active", true).order("sort_order"),
      supabase.from("coaching_expertise_specializations").select("id,category_id,name,description,sort_order").eq("active", true).order("sort_order"),
    ]).then(([authResult, categoriesResult, specializationsResult]) => {
      setUserId(authResult.data.user?.id ?? null);
      if (!categoriesResult.error) setCategories(categoriesResult.data ?? []);
      if (!specializationsResult.error) setSpecializations(specializationsResult.data ?? []);
      if (categoriesResult.error || specializationsResult.error) setError("We could not load the coaching expertise directory. Please refresh and try again.");
      setChecking(false);
      setLoadingTaxonomy(false);
    });
  }, []);

  const update = (key: string, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const toggleArray = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: (current[key] as string[]).includes(value) ? (current[key] as string[]).filter(item => item !== value) : [...(current[key] as string[]), value] }));

  const toggleCategory = (categoryId: string) => setForm(current => ({
    ...current,
    expertise_category_ids: current.expertise_category_ids.includes(categoryId)
      ? current.expertise_category_ids.filter(id => id !== categoryId)
      : [...current.expertise_category_ids, categoryId],
  }));

  const toggleSpecialization = (specializationId: string) => setForm(current => ({
    ...current,
    expertise_specialization_ids: current.expertise_specialization_ids.includes(specializationId)
      ? current.expertise_specialization_ids.filter(id => id !== specializationId)
      : [...current.expertise_specialization_ids, specializationId],
  }));

  const groupedSpecializations = useMemo(() => categories.map(category => ({
    category,
    items: specializations.filter(item => item.category_id === category.id),
  })).filter(group => group.items.length), [categories, specializations]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!userId) return setError("Please sign in to submit a coach application.");
    if (!form.display_name.trim() || !form.headline.trim() || !form.bio.trim() || !form.expertise_category_ids.length || !form.expertise_specialization_ids.length || !form.coaching_formats.length || !form.agreements) {
      return setError("Please complete your required profile, select at least one expertise category and specialization, choose a coaching format, and accept the marketplace agreements.");
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("coach_marketplace_applications").insert({
        applicant_user_id: userId,
        display_name: form.display_name.trim(), headline: form.headline.trim(), bio: form.bio.trim(),
        professional_title: form.professional_title.trim() || null, professional_bio: form.professional_bio.trim() || null,
        specializations: form.expertise_specialization_ids.map(id => specializations.find(item => item.id === id)?.name).filter(Boolean),
        expertise_category_ids: form.expertise_category_ids, expertise_specialization_ids: form.expertise_specialization_ids,
        coaching_formats: form.coaching_formats, target_client_groups: form.target_client_groups, career_stages: form.career_stages,
        industries: form.industries, coaching_approaches: form.coaching_approaches,
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

      <div className="section"><h2>Coaching expertise</h2><p className="hint">Choose the areas in which you genuinely have relevant competence and experience. This structured information will support coach matching.</p>
        <label>Primary expertise categories *</label>
        {loadingTaxonomy ? <p className="hint">Loading expertise directory…</p> : <div className="chips">{categories.map(category => <button type="button" className={form.expertise_category_ids.includes(category.id) ? "chip active" : "chip"} onClick={() => toggleCategory(category.id)} key={category.id} title={category.description ?? undefined}>{category.name}</button>)}</div>}
        <label>Specializations * <span className="hint-inline">Select all that accurately describe your practice.</span></label>
        <div className="specialization-groups">{groupedSpecializations.map(({ category, items }) => <div className="specialization-group" key={category.id}><h3>{category.name}</h3><div className="chips">{items.map(item => <button type="button" className={form.expertise_specialization_ids.includes(item.id) ? "chip active" : "chip"} onClick={() => toggleSpecialization(item.id)} key={item.id} title={item.description ?? undefined}>{item.name}</button>)}</div></div>)}</div>
        <label>Coaching formats *</label><div className="chips">{formats.map(x => <button type="button" className={form.coaching_formats.includes(x) ? "chip active" : "chip"} onClick={() => toggleArray("coaching_formats", x)} key={x}>{x}</button>)}</div>
        <Field label="Coaching methodology" value={form.methodology} onChange={v => update("methodology", v)} area />
        <div className="two"><Field label="Years of professional experience" value={form.years_experience} onChange={v => update("years_experience", v)} type="number" /><Field label="Years of coaching experience" value={form.coaching_experience_years} onChange={v => update("coaching_experience_years", v)} type="number" /></div><Field label="Credentials / certifications (comma separated)" value={form.credentials} onChange={v => update("credentials", v)} />
      </div>

      <div className="section"><h2>Who and what you coach</h2><p className="hint">These selections help CareerDev Global understand the context in which your expertise is most relevant.</p>
        <ChoiceGroup label="Target client groups" items={clientGroups} selected={form.target_client_groups} onToggle={v => toggleArray("target_client_groups", v)} />
        <ChoiceGroup label="Career stages" items={careerStages} selected={form.career_stages} onToggle={v => toggleArray("career_stages", v)} />
        <ChoiceGroup label="Industries / sectors" items={industries} selected={form.industries} onToggle={v => toggleArray("industries", v)} />
        <ChoiceGroup label="Coaching approaches" items={approaches} selected={form.coaching_approaches} onToggle={v => toggleArray("coaching_approaches", v)} />
      </div>

      <div className="section"><h2>Professional links & availability</h2><div className="two"><Field label="LinkedIn URL" value={form.linkedin_url} onChange={v => update("linkedin_url", v)} /><Field label="Website URL" value={form.website_url} onChange={v => update("website_url", v)} /></div><Field label="Availability summary" value={form.availability_summary} onChange={v => update("availability_summary", v)} area placeholder="Example: Weekdays, 17:00–21:00 WAT; Saturday mornings." /></div>
      <div className="agreement"><input id="agreements" type="checkbox" checked={form.agreements} onChange={e => update("agreements", e.target.checked)} /><label htmlFor="agreements">I agree to CareerDev Global's coach marketplace terms, professional standards and review process. *</label></div>
      {error && <div className="error">{error}</div>}
      <button className="submit" type="submit" disabled={!userId || loadingTaxonomy}>Submit coach application</button>
      <p className="footnote">Submitting an application does not guarantee marketplace approval or activation. Expertise selections describe a coach's stated practice; credentials and eligibility may be independently reviewed before marketplace activation.</p>
    </form>}
  </main>;
}

function ChoiceGroup({ label, items, selected, onToggle }: { label: string; items: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return <div className="choice-group"><label>{label}</label><div className="chips">{items.map(item => <button type="button" className={selected.includes(item) ? "chip active" : "chip"} onClick={() => onToggle(item)} key={item}>{item}</button>)}</div></div>;
}

function Field({ label, value, onChange, area = false, type = "text", placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; area?: boolean; type?: string; placeholder?: string }) {
  return <label className="field">{label}{area ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}</label>;
}
