"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type CareerProfile = {
  professional_summary: string | null;
  career_stage: string | null;
  current_job_title: string | null;
  current_industry: string | null;
  current_location: string | null;
  target_role: string | null;
  target_industry: string | null;
  target_location: string | null;
  target_roles: string[] | null;
  target_industries: string[] | null;
  target_locations: string[] | null;
  career_interests: string[] | null;
  interests: string | null;
  strengths_summary: string | null;
  development_gaps_summary: string | null;
  achievements: string | null;
  certifications: string | null;
  leadership_experience: string | null;
};
type Goal = { goal: string; priority: number; target_date: string | null };
type Finding = { finding: string; career_relevance: string; source_urls: string[] };
type ResearchReport = {
  title: string;
  executive_summary: string;
  role_expectations: string[];
  industry_signals: string[];
  company_signals: string[];
  profile_alignment: { relevant_strengths: string[]; development_areas: string[]; suggested_positioning: string[] };
  key_findings: Finding[];
  questions_for_user: string[];
  sources: { title: string; url: string; relevance: string }[];
  uncertainty_flags: string[];
  generated_at?: string;
  research_round?: number;
  provider?: string;
};
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return <section style={{ marginTop: 20 }}><h3>{title}</h3><ul>{items.map((item, i) => <li key={i} style={{ marginBottom: 7 }}>{item}</li>)}</ul></section>;
}

export default function CareerResearchWorkspace() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [useSavedProfile, setUseSavedProfile] = useState(true);
  const [externalConsent, setExternalConsent] = useState(false);
  const [jobRole, setJobRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [focusQuestion, setFocusQuestion] = useState("");
  const [jobContext, setJobContext] = useState("");
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [creditsUsed, setCreditsUsed] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    async function load() {
      setLoading(true);
      setMessage("");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (current) { setMessage("Sign in to use Career Research."); setLoading(false); }
        return;
      }
      const { data: account } = await supabase.from("profiles").select("role,status").eq("id", auth.user.id).maybeSingle();
      if (!account || account.status !== "active" || !["client", "coach", "admin", "staff"].includes(account.role)) {
        if (current) { setMessage("Career Research is available to active CareerDev Global clients, coaches, staff, and admins."); setLoading(false); }
        return;
      }
      if (current) setRole(account.role);
      const staffTesting = account.role === "admin" || account.role === "staff";
      let agentAccess = staffTesting;
      if (!staffTesting) {
        const { data: subscription } = await supabase.rpc("get_my_ai_subscription");
        const row = Array.isArray(subscription) ? subscription[0] : subscription;
        agentAccess = (row?.included_agents || []).includes("career_research_agent");
      }
      if (current) setAllowed(agentAccess);

      const { data: client } = await supabase.from("clients").select("id").eq("profile_id", auth.user.id).maybeSingle();
      if (client?.id) {
        const [{ data: savedProfile }, { data: savedGoals }] = await Promise.all([
          supabase.from("career_profiles")
            .select("professional_summary,career_stage,current_job_title,current_industry,current_location,target_role,target_industry,target_location,target_roles,target_industries,target_locations,career_interests,interests,strengths_summary,development_gaps_summary,achievements,certifications,leadership_experience")
            .eq("client_id", client.id).eq("is_current", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("career_goals").select("goal,priority,target_date").eq("client_id", client.id).eq("status", "active").order("priority", { ascending: true }).order("created_at", { ascending: false }).limit(10),
        ]);
        if (current && savedProfile) {
          const careerProfile = savedProfile as CareerProfile;
          setProfile(careerProfile);
          setJobRole(careerProfile.target_role || careerProfile.target_roles?.[0] || "");
          setIndustry(careerProfile.target_industry || careerProfile.target_industries?.[0] || "");
          setLocation(careerProfile.target_location || careerProfile.target_locations?.[0] || "");
        }
        if (current && savedGoals) setGoals(savedGoals as Goal[]);
      }
      if (current) setLoading(false);
    }
    void load();
    return () => { current = false; };
  }, [supabase]);

  async function runResearch(action: "start" | "refine", event?: FormEvent) {
    event?.preventDefault();
    setMessage("");
    if (!externalConsent) { setMessage("Please consent before sending your research request and selected career context to Groq Free."); return; }
    if (!SUPABASE_URL || !SUPABASE_KEY) { setMessage("Career Research is not configured for this deployment."); return; }
    if (![jobRole.trim(), industry.trim(), company.trim()].some(Boolean) || !focusQuestion.trim()) {
      setMessage("Enter at least one of role, industry, or company, and describe what you want to learn.");
      return;
    }
    const nextRound = action === "start" ? 0 : round + 1;
    const followUpAnswers = action === "refine"
      ? Object.entries(answers).map(([index, answer]) => ({ question: report?.questions_for_user[Number(index)] || "", answer: answer.trim() })).filter(item => item.question && item.answer)
      : [];
    if (action === "refine" && followUpAnswers.length === 0) { setMessage("Answer at least one follow-up question to refine your report."); return; }
    setBusy(true);
    if (action === "start") { setReport(null); setRound(0); setAnswers({}); }
    try {
      const { data: auth } = await supabase.auth.getSession();
      const session = auth.session;
      if (!session) throw new Error("Your session expired. Sign in again to run Career Research.");
      const response = await fetch(`${SUPABASE_URL}/functions/v1/careerdev-career-research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {}),
        },
        body: JSON.stringify({
          action,
          job_role: jobRole,
          industry,
          company_name: company,
          location,
          focus_question: focusQuestion,
          job_context: jobContext,
          use_saved_profile: useSavedProfile,
          external_ai_consent: true,
          follow_up_answers: followUpAnswers,
          previous_report: report,
          round: nextRound,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Career Research could not be completed.");
      setReport(body.report as ResearchReport);
      setRound(nextRound);
      setExecutionId(body.execution_id || null);
      setCreditsUsed(Number(body.credits_used || 0));
      setAnswers({});
      document.getElementById("career-research-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Career Research could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function startNewResearch() {
    setReport(null);
    setAnswers({});
    setRound(0);
    setExecutionId(null);
    setCreditsUsed(null);
    setMessage("");
  }

  const savedContextItems: { label: string; value: string }[] = [
    { label: "Career stage", value: profile?.career_stage || "" },
    { label: "Current role", value: profile?.current_job_title || "" },
    { label: "Current industry", value: profile?.current_industry || "" },
    { label: "Target role", value: profile?.target_role || profile?.target_roles?.[0] || "" },
    { label: "Target industry", value: profile?.target_industry || profile?.target_industries?.[0] || "" },
    { label: "Location", value: profile?.target_location || profile?.target_locations?.[0] || profile?.current_location || "" },
    { label: "Strengths", value: profile?.strengths_summary || "" },
    { label: "Development focus", value: profile?.development_gaps_summary || "" },
  ].filter(item => item.value.trim());

  if (loading) return <main className="ci-page cr-page"><section className="ci-section"><div className="ci-container"><p role="status">Loading your Career Research workspace…</p></div></section></main>;
  if (!role) return <main className="ci-page cr-page"><section className="ci-section"><div className="ci-container"><h1>Career Research</h1><p role="status">{message || "Sign in to continue."}</p><a className="ci-primary" href="/account">Sign in →</a></div></section></main>;
  if (!allowed) return <main className="ci-page cr-page"><nav className="ci-subnav"><div className="ci-container ci-subnav-inner"><a href="/career-intelligence">← Career Intelligence</a><a href="/agents">All AI Agents</a></div></nav><section className="ci-section"><div className="ci-container"><h1>Career Research access</h1><p>{message || "Career Research requires an active plan that includes this AI Agent. Staff and Admin can use it for testing."}</p><a className="ci-primary" href="/pricing">Review available plans →</a></div></section></main>;

  return (
    <main className="ci-page cr-page">
      <nav className="ci-subnav" aria-label="Career Research navigation">
        <div className="ci-container ci-subnav-inner"><a href="/career-intelligence">← Career Intelligence Platform</a><div><a href="/career-intelligence#profile">Your Profile</a><a href="/agents">All AI Agents</a></div></div>
      </nav>
      <header className="ci-hero">
        <div className="ci-container ci-hero-grid">
          <div><div className="ci-kicker">CAREERDEV GLOBAL · LIVE CAREER RESEARCH</div><h1>Explore the role, industry, or company behind your next move.</h1><p>Search the web for current career information, then connect the findings to your saved Career Intelligence Profile and goals.</p><div className="ci-trust"><span>✓ Live web research</span><span>✓ Profile-aware insights</span><span>✓ Source-linked findings</span></div></div>
          <aside className="ci-hero-panel" aria-label="Career Research workflow"><div className="ci-panel-label">RESEARCH WORKFLOW</div><div className="ci-panel-title">Search. Personalize. Refine.</div><div className="ci-journey"><span>Web</span><b>→</b><span>Profile</span><b>→</b><span>Questions</span></div><div className="ci-panel-metrics"><div><strong>01</strong><small>Search</small></div><div><strong>02</strong><small>Connect</small></div><div><strong>03</strong><small>Refine</small></div></div></aside>
        </div>
      </header>

      <section className="ci-section soft cr-input-section"><div className="ci-container">
        <div className="ci-section-heading"><span>01</span><div><div className="ci-overline">SET YOUR RESEARCH FOCUS</div><h2>What do you want to understand?</h2><p>Use saved career context or adjust the search for a role, industry, company, or location.</p></div></div>
        <div className="ci-card cr-research-card">
          {profile && <section className="cr-profile-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>Saved Career Intelligence Profile</strong><a href="/career-intelligence#profile">Review or update →</a></div>
            {profile.professional_summary && <p>{profile.professional_summary}</p>}
            {savedContextItems.length > 0 && <div className="cr-profile-grid">{savedContextItems.map(item => <div className="cr-profile-item" key={item.label}><b>{item.label}</b><div>{item.value}</div></div>)}</div>}
            {goals.length > 0 && <div style={{ marginTop: 10 }}><b>Saved goals</b><ul>{goals.slice(0, 4).map((goal, i) => <li key={i}>{goal.goal}</li>)}</ul></div>}
            <label className="cr-profile-consent"><input type="checkbox" checked={useSavedProfile} onChange={e => setUseSavedProfile(e.target.checked)} /><span>Include my saved Career Intelligence profile and goals for personalized analysis.</span></label>
          </section>}
          <form className="cr-form" onSubmit={e => void runResearch("start", e)}>
            <div className="cr-field-grid">
              <div className="cr-field"><label htmlFor="research-role">Job role or career path</label><input className="cr-input" id="research-role" value={jobRole} onChange={e => setJobRole(e.target.value)} maxLength={180} placeholder="e.g. Project Manager" /></div>
              <div className="cr-field"><label htmlFor="research-industry">Industry</label><input className="cr-input" id="research-industry" value={industry} onChange={e => setIndustry(e.target.value)} maxLength={180} placeholder="e.g. Development / NGO" /></div>
              <div className="cr-field"><label htmlFor="research-company">Company or organization</label><input className="cr-input" id="research-company" value={company} onChange={e => setCompany(e.target.value)} maxLength={180} placeholder="e.g. employer name" /></div>
              <div className="cr-field"><label htmlFor="research-location">Country or location <span>(optional)</span></label><input className="cr-input" id="research-location" value={location} onChange={e => setLocation(e.target.value)} maxLength={180} placeholder="e.g. Nigeria, remote, UK" /></div>
            </div>
            <div className="cr-field"><label htmlFor="research-question">What do you want the research to answer?</label><textarea className="cr-textarea cr-question" id="research-question" value={focusQuestion} onChange={e => setFocusQuestion(e.target.value)} maxLength={1200} rows={3} placeholder="e.g. What skills and evidence are commonly expected, and what should I know about this employer?" required /></div>
            <div className="cr-field"><label htmlFor="research-context">Job description or additional context <span>(optional)</span></label><textarea className="cr-textarea cr-context" id="research-context" value={jobContext} onChange={e => setJobContext(e.target.value)} maxLength={8000} rows={5} placeholder="Paste relevant job duties, company notes, or a specific question. Do not paste passwords, identity numbers, or other sensitive information." /></div>
            <div className="cr-consent">
              <label><input type="checkbox" checked={externalConsent} onChange={e => setExternalConsent(e.target.checked)} /><span><strong>Share this research request with Groq Free.</strong> The role, industry, company, question, optional notes, and selected Career Intelligence profile context will be sent to Groq to search and prepare a report. Use only information you are comfortable sharing with the AI provider.</span></label>
            </div>
            <button className="ci-primary cr-submit" type="submit" disabled={busy || !externalConsent}>{busy ? <><span className="cr-spinner" aria-hidden="true" />Searching current sources and preparing your report…</> : <>Research this career direction <span aria-hidden="true">→</span></>}</button>
            <p className="ci-helper">Groq Free web search and model inference are rate-limited. Each research or refinement uses 2 CareerDev AI credits for eligible client plans; Staff/Admin test runs do not use customer credits. No paid provider fallback is enabled.</p>
            {message && <p className="ci-message" role="status">{message}</p>}
          </form>
        </div>
      </div></section>

      {report && <section className="ci-section" id="career-research-report"><div className="ci-container">
        <div className="ci-section-heading"><span>02</span><div><div className="ci-overline">LIVE RESEARCH REPORT · ROUND {round + 1}</div><h2>{report.title}</h2><p>{report.executive_summary}</p></div></div>
        {executionId && <p className="ci-helper">Saved to governed Career Research history · {creditsUsed === 0 ? "No customer credits charged for Staff/Admin test access." : `${creditsUsed} CareerDev AI credits used this round.`}</p>}
        <div className="ci-grid">
          <article className="ci-card"><h3>Role expectations</h3><List title="" items={report.role_expectations} /><List title="Industry signals" items={report.industry_signals} /><List title="Company signals" items={report.company_signals} /></article>
          <article className="ci-card"><h3>How this relates to your profile</h3><List title="Relevant strengths from your saved profile" items={report.profile_alignment?.relevant_strengths || []} /><List title="Development areas to consider" items={report.profile_alignment?.development_areas || []} /><List title="Suggested positioning" items={report.profile_alignment?.suggested_positioning || []} /></article>
        </div>
        <article className="ci-card" style={{ marginTop: 18 }}><h3>Research findings</h3>{report.key_findings?.map((item, i) => <div className="ci-result" key={i}><strong>{item.finding}</strong><p>{item.career_relevance}</p>{item.source_urls?.length > 0 && <small>Sources: {item.source_urls.map((url, j) => <a key={j} href={url} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>Source {j + 1} ↗</a>)}</small>}</div>)}</article>
        <article className="ci-card" style={{ marginTop: 18 }}><h3>Sources</h3>{report.sources?.length ? <ol>{report.sources.map((source, i) => <li key={i} style={{ marginBottom: 9 }}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><div>{source.relevance}</div></li>)}</ol> : <p>No machine-checkable source URLs were returned. Review citations in the research text and verify important findings independently.</p>}{report.uncertainty_flags?.map((flag, i) => <p key={i} className="ci-helper">⚠ {flag}</p>)}</article>

        <article className="ci-card" style={{ marginTop: 18 }}><div className="ci-section-heading"><span>03</span><div><div className="ci-overline">REFINE THE REPORT</div><h3>Answer a few targeted questions</h3><p>Your answers can help tailor the report to your experience, location, and priorities.</p></div></div>
          {round < 2 && report.questions_for_user?.length > 0 ? <form onSubmit={e => void runResearch("refine", e)}>
            {report.questions_for_user.map((question, i) => <div key={i} style={{ marginBottom: 15 }}><label htmlFor={`research-followup-${i}`}>{question}</label><textarea id={`research-followup-${i}`} rows={2} value={answers[i] || ""} onChange={e => setAnswers(current => ({ ...current, [i]: e.target.value }))} maxLength={1200} /></div>)}
            <button className="ci-primary" type="submit" disabled={busy || !Object.values(answers).some(value => value.trim())}>{busy ? "Updating research and report…" : "Use my answers to improve the report →"}</button>
          </form> : <p>You have completed the available refinement rounds. Start new research if you want to explore a different direction.</p>}
          <button className="ci-secondary" type="button" style={{ marginTop: 14 }} onClick={startNewResearch}>Start new research</button>
          <small className="ci-helper" style={{ display: "block", marginTop: 10 }}>Career research is decision support, not a hiring guarantee. Confirm time-sensitive requirements with the employer or original source.</small>
        </article>
      </div></section>}

      <footer className="ci-footer"><div className="ci-container"><div><strong>CareerDev Global</strong><span>Developing careers, leaders, and talents across borders.</span></div><div><a href="/career-intelligence">Career Intelligence</a><a href="/agents">AI Agents</a><a href="/coach-matching">Find a Coach</a></div></div></footer>
    </main>
  );
}
