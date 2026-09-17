'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import "./styles.css";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type Category = { id: string; name: string; description: string | null; sort_order: number };
type Specialization = { id: string; category_id: string; name: string; description: string | null; sort_order: number };
type Option = { id: string; name: string; description?: string | null };

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
  const toggleCategory = (categoryId: string) => setForm(current => ({ ...current, expertise_category_ids: current.expertise_category_ids.includes(categoryId) ? current.expertise_category_ids.filter(id => id !== categoryId) : [...current.expertise_category_ids, categoryId] }));
  const toggleSpecialization = (specializationId: string) => setForm(current => ({ ...current, expertise_specialization_ids: current.expertise_specialization_ids.includes(specializationId) ? current.expertise_specialization_ids.filter(id => id !== specializationId) : [...current.expertise_specialization_ids, specializationId] }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!userId) return setError("Please sign in to submit a coach application.");
    if (!form.display_name.trim() || !form.headline.trim() || !form.bio.trim() || !form.expertise_category_ids.length || !form.expertise_specialization_ids.length || !form.coaching_formats.length || !form.agreements) return setError("Please complete your required profile, select at least one expertise category and specialization, choose a coaching format, and accept the marketplace agreements.");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("coach_marketplace_applications").insert({
        applicant_user_id: userId, display_name: form.display_name.trim(), headline: form.headline.trim(), bio: form.bio.trim(), professional_title: form.professional_title.trim() || null, professional_bio: form.professional_bio.trim() || null,
        specializations: form.expertise_specialization_ids.map(id => specializations.find(item => item.id === id)?.name).filter(Boolean), expertise_category_ids: form.expertise_category_ids, expertise_specialization_ids: form.expertise_specialization_ids,
        coaching_formats: form.coaching_formats, target_client_groups: form.target_client_groups, career_stages: form.career_stages, industries: form.industries, coaching_approaches: form.coaching_approaches,
        languages: form.languages.split(",").map(x => x.trim()).filter(Boolean), methodology: form.methodology.trim() || null, credentials: form.credentials.split(",").map(x => x.trim()).filter(Boolean), years_experience: form.years_experience ? Number(form.years_experience) : null, coaching_experience_years: form.coaching_experience_years ? Number(form.coaching_experience_years) : null,
        country: form.country.trim() || null, timezone: form.timezone.trim() || null, linkedin_url: form.linkedin_url.trim() || null, website_url: form.website_url.trim() || null, availability_summary: form.availability_summary.trim() || null,
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
      <div className="section"><h2>Professional profile</h2><p className="hint">Keep this concise. These details form the foundation of your public marketplace profile.</p><div className="two"><Field label="Display name *" value={form.display_name} onChange={v => update("display_name", v)} /><Field label="Professional headline *" value={form.headline} onChange={v => update("headline", v)} /></div><Field label="Short coach bio *" value={form.bio} onChange={v => update("bio", v)} area /><div className="two"><Field label="Professional title" value={form.professional_title} onChange={v => update("professional_title", v)} /><Field label="Country" value={form.country} onChange={v => update("country", v)} /></div><div className="two"><Field label="Timezone" value={form.timezone} onChange={v => update("timezone", v)} /><Field label="Languages (comma separated)" value={form.languages} onChange={v => update("languages", v)} /></div></div>

      <div className="section"><h2>Coaching expertise</h2><p className="hint">Select from compact dropdowns. Start typing to filter the options.</p>
        <DropdownMulti label="Primary expertise categories *" placeholder="Select expertise categories" options={categories.map(c => ({ id: c.id, name: c.name, description: c.description }))} selected={form.expertise_category_ids} onToggle={toggleCategory} loading={loadingTaxonomy} />
        <DropdownMulti label="Specializations *" placeholder="Select specializations" options={specializations.map(s => ({ id: s.id, name: s.name, description: s.description }))} selected={form.expertise_specialization_ids} onToggle={toggleSpecialization} loading={loadingTaxonomy} />
        <SelectedSummary count={form.expertise_category_ids.length + form.expertise_specialization_ids.length} text="expertise selections" />
        <DropdownTextMulti label="Coaching formats *" placeholder="Select coaching formats" items={formats} selected={form.coaching_formats} onToggle={v => toggleArray("coaching_formats", v)} />
        <Field label="Coaching methodology" value={form.methodology} onChange={v => update("methodology", v)} area />
        <div className="two"><Field label="Years of professional experience" value={form.years_experience} onChange={v => update("years_experience", v)} type="number" /><Field label="Years of coaching experience" value={form.coaching_experience_years} onChange={v => update("coaching_experience_years", v)} type="number" /></div><Field label="Credentials / certifications (comma separated)" value={form.credentials} onChange={v => update("credentials", v)} />
      </div>

      <div className="section"><h2>Who and what you coach</h2><p className="hint">Use the dropdowns to choose only what applies to your practice.</p>
        <DropdownTextMulti label="Target client groups" placeholder="Select client groups" items={clientGroups} selected={form.target_client_groups} onToggle={v => toggleArray("target_client_groups", v)} />
        <DropdownTextMulti label="Career stages" placeholder="Select career stages" items={careerStages} selected={form.career_stages} onToggle={v => toggleArray("career_stages", v)} />
        <DropdownTextMulti label="Industries / sectors" placeholder="Select industries or sectors" items={industries} selected={form.industries} onToggle={v => toggleArray("industries", v)} />
        <DropdownTextMulti label="Coaching approaches" placeholder="Select coaching approaches" items={approaches} selected={form.coaching_approaches} onToggle={v => toggleArray("coaching_approaches", v)} />
      </div>

      <div className="section"><h2>Professional links & availability</h2><div className="two"><Field label="LinkedIn URL" value={form.linkedin_url} onChange={v => update("linkedin_url", v)} /><Field label="Website URL" value={form.website_url} onChange={v => update("website_url", v)} /></div><Field label="Availability summary" value={form.availability_summary} onChange={v => update("availability_summary", v)} area placeholder="Example: Weekdays, 17:00–21:00 WAT; Saturday mornings." /></div>
      <div className="agreement"><input id="agreements" type="checkbox" checked={form.agreements} onChange={e => update("agreements", e.target.checked)} /><label htmlFor="agreements">I agree to CareerDev Global's coach marketplace terms, professional standards and review process. *</label></div>
      {error && <div className="error">{error}</div>}
      <button className="submit" type="submit" disabled={!userId || loadingTaxonomy}>Submit coach application</button>
      <p className="footnote">Submitting an application does not guarantee marketplace approval or activation. Expertise selections describe a coach's stated practice; credentials and eligibility may be independently reviewed before marketplace activation.</p>
    </form>}
  </main>;
}

function DropdownMulti({ label, placeholder, options, selected, onToggle, loading }: { label: string; placeholder: string; options: Option[]; selected: string[]; onToggle: (id: string) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter(option => !q || `${option.name} ${option.description ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);
  const selectedOptions = selected.map(id => options.find(option => option.id === id)).filter((option): option is Option => Boolean(option));

  return <div className="dropdown-field">
    <label>{label}</label>
    <button type="button" className={open ? "dropdown-trigger open" : "dropdown-trigger"} onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span>{selectedOptions.length ? `${selectedOptions.length} selected` : placeholder}</span><span className="dropdown-chevron">⌄</span>
    </button>
    {open && <div className="dropdown-menu" role="dialog" aria-label={label}>
      <input autoFocus className="dropdown-search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} />
      {loading ? <p className="hint dropdown-status">Loading…</p> : <div className="dropdown-options" role="listbox" aria-multiselectable="true">
        {filtered.slice(0, 15).map(option => <button type="button" role="option" aria-selected={selected.includes(option.id)} className={selected.includes(option.id) ? "dropdown-option selected" : "dropdown-option"} onClick={() => onToggle(option.id)} key={option.id}><span>{option.name}</span><b>{selected.includes(option.id) ? "✓" : ""}</b></button>)}
        {!filtered.length && <p className="no-results">No matches found.</p>}
      </div>}
    </div>}
    <SelectedPills options={options} selected={selected} onRemove={onToggle} />
  </div>;
}

function DropdownTextMulti({ label, placeholder, items, selected, onToggle }: { label: string; placeholder: string; items: string[]; selected: string[]; onToggle: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => items.filter(item => item.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);

  return <div className="dropdown-field">
    <label>{label}</label>
    <button type="button" className={open ? "dropdown-trigger open" : "dropdown-trigger"} onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span>{selected.length ? `${selected.length} selected` : placeholder}</span><span className="dropdown-chevron">⌄</span>
    </button>
    {open && <div className="dropdown-menu" role="dialog" aria-label={label}>
      <input autoFocus className="dropdown-search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} />
      <div className="dropdown-options" role="listbox" aria-multiselectable="true">
        {filtered.map(item => <button type="button" role="option" aria-selected={selected.includes(item)} className={selected.includes(item) ? "dropdown-option selected" : "dropdown-option"} onClick={() => onToggle(item)} key={item}><span>{item}</span><b>{selected.includes(item) ? "✓" : ""}</b></button>)}
        {!filtered.length && <p className="no-results">No matches found.</p>}
      </div>
    </div>}
    <SelectedTextPills values={selected} onRemove={onToggle} />
  </div>;
}

function SelectedPills({ options, selected, onRemove }: { options: Option[]; selected: string[]; onRemove: (id: string) => void }) { return <div className="selected-pills">{selected.map(id => { const option = options.find(o => o.id === id); return option ? <button type="button" key={id} onClick={() => onRemove(id)}>{option.name} ×</button> : null; })}</div>; }
function SelectedTextPills({ values, onRemove }: { values: string[]; onRemove: (value: string) => void }) { return <div className="selected-pills">{values.map(value => <button type="button" key={value} onClick={() => onRemove(value)}>{value} ×</button>)}</div>; }
function SelectedSummary({ count, text }: { count: number; text: string }) { return count ? <p className="selection-summary">{count} {text} selected</p> : null; }
function Field({ label, value, onChange, area = false, type = "text", placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; area?: boolean; type?: string; placeholder?: string }) { return <label className="field">{label}{area ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}</label>; }
