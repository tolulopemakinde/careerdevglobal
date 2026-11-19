"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type Goal = { id: string; goal: string; priority: number; target_date: string | null; created_at: string };

const prompts = [
  { title: "Choose the outcome", label: "What career outcome do you want to move toward?", hint: "Make it concrete: a role, transition, promotion, or milestone." },
  { title: "Name the barrier", label: "What is the main thing making this outcome difficult right now?", hint: "Focus on the one barrier that would be most useful to address first." },
  { title: "Pick one action", label: "What specific action can you complete in the next seven days?", hint: "Choose something within your control, with a clear finish point." },
  { title: "Define progress", label: "What evidence will show that you completed the action or made progress?", hint: "For example: a draft CV, three applications, a conversation booked, or a skills exercise completed." },
];

export default function CareerCoachPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        if (live) { setMessage("Sign in to start a guided career coaching session."); setLoading(false); }
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
      if (!profile || profile.status !== "active" || !["client", "coach", "staff", "admin"].includes(profile.role)) {
        if (live) { setMessage("This guided coaching workspace is available to active CareerDev users."); setLoading(false); }
        return;
      }

      const staffAccess = profile.role === "staff" || profile.role === "admin";
      let hasAccess = staffAccess;
      if (!staffAccess) {
        const { data: subscription } = await supabase.rpc("get_my_ai_subscription");
        const row = Array.isArray(subscription) ? subscription[0] : subscription;
        hasAccess = (row?.included_agents || []).includes("career_coach_agent");
      }
      if (!live) return;
      setAllowed(hasAccess);
      if (!hasAccess) { setLoading(false); return; }

      const { data: client } = await supabase.from("clients").select("id").eq("profile_id", user.id).maybeSingle();
      if (client?.id) {
        setCanSave(true);
        const { data: savedGoals } = await supabase.from("career_goals").select("id,goal,priority,target_date,created_at").eq("client_id", client.id).eq("status", "active").order("priority", { ascending: true }).order("created_at", { ascending: false }).limit(10);
        if (live && savedGoals) {
          setGoals(savedGoals as Goal[]);
          if (savedGoals[0]?.goal) setAnswers(current => [current[0] || savedGoals[0].goal, current[1], current[2], current[3]]);
        }
      }
      if (live) setLoading(false);
    }
    void load();
    return () => { live = false; };
  }, [supabase]);

  function updateAnswer(value: string) {
    setAnswers(current => current.map((answer, index) => index === step ? value : answer));
    setMessage("");
  }

  function continueSession() {
    if (!answers[step]?.trim()) { setMessage("Add a short answer before continuing."); return; }
    if (step < prompts.length - 1) setStep(step + 1);
    else setComplete(true);
    setMessage("");
  }

  async function saveAction() {
    if (!canSave) {
      setMessage("Your session is ready. Sign in with a client profile to save this action to Career Goals.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) { setSaving(false); setMessage("Your session ended. Sign in again to save this action."); return; }
    const { data: client, error: clientError } = await supabase.from("clients").select("id").eq("profile_id", user.id).maybeSingle();
    if (clientError || !client?.id) { setSaving(false); setMessage("Could not find your client profile, so the action was not saved."); return; }
    const target = new Date();
    target.setDate(target.getDate() + 7);
    const { error } = await supabase.from("career_goals").insert({
      client_id: client.id,
      goal: `Career Coach action: ${answers[2].trim()} | Progress evidence: ${answers[3].trim()}`,
      priority: 1,
      target_date: target.toISOString().slice(0, 10),
      status: "active",
    });
    setSaving(false);
    if (error) { setMessage("The action could not be saved. You can copy it from this review and try again later."); return; }
    setMessage("Your action and progress evidence were saved to Career Goals with a seven-day target.");
  }

  function startAgain() {
    setAnswers(["", "", "", ""]);
    setStep(0);
    setComplete(false);
    setMessage("");
  }

  return (
    <section className="ci-section" id="career-coach">
      <div className="ci-container">
        <div className="ci-section-heading"><span>COACH</span><div><div className="ci-overline">CAREER COACH</div><h2>Turn a career goal into one clear next step.</h2><p>A short guided session uses your saved career goals when available, then helps you identify a barrier, a realistic action, and evidence of progress.</p></div></div>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(20px,4vw,34px)", borderRadius: 18, background: "#fff", border: "1px solid #d8e6f1", boxShadow: "0 12px 36px rgba(0,45,90,.08)" }}>
          {loading ? <p role="status">Loading your Career Coach workspace…</p> : !allowed ? (
            <div><h3>Career Coach access</h3><p>{message || "Career Coach is included with eligible AI Agent access. Staff and Admin can use this workspace for testing."}</p><a className="ci-primary" href={message.includes("Sign in") ? "/account" : "/pricing"}>{message.includes("Sign in") ? "Sign in →" : "View access options →"}</a></div>
          ) : complete ? (
            <div>
              <div className="ci-overline">YOUR COACHING PLAN</div><h3 style={{ marginTop: 8 }}>A focused next step</h3>
              <dl style={{ display: "grid", gap: 12, margin: "18px 0" }}>
                {prompts.map((prompt, index) => <div key={prompt.title} style={{ padding: 14, borderRadius: 12, background: "#f5f9fc" }}><dt style={{ fontWeight: 800, color: "#0b5d9b" }}>{prompt.title}</dt><dd style={{ margin: "5px 0 0", whiteSpace: "pre-wrap" }}>{answers[index]}</dd></div>)}
              </dl>
              <p style={{ color: "#527085" }}>Only the action and its progress evidence are saved to your Career Goals. Your reflection answers stay in this page session.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {canSave && <button type="button" onClick={() => void saveAction()} disabled={saving} className="ci-primary">{saving ? "Saving…" : "Save action to Career Goals"}</button>}
                <button type="button" onClick={startAgain} className="ci-secondary">Start another session</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><span className="ci-overline">STEP {step + 1} OF {prompts.length}</span><span style={{ color: "#607487", fontSize: 13 }}>Guided coaching · no AI credits used</span></div>
              <div role="progressbar" aria-label="Coaching session progress" aria-valuemin={1} aria-valuemax={prompts.length} aria-valuenow={step + 1} style={{ height: 7, borderRadius: 99, background: "#e5eef5", margin: "12px 0 22px" }}><div style={{ width: `${((step + 1) / prompts.length) * 100}%`, height: "100%", borderRadius: 99, background: "#1671b9" }} /></div>
              <h3 style={{ margin: "0 0 8px" }}>{prompts[step].label}</h3><p style={{ color: "#607487", marginTop: 0 }}>{prompts[step].hint}</p>
              {step === 0 && goals.length > 0 && <label style={{ display: "block", margin: "12px 0", fontWeight: 700 }}>Use a saved career goal<select value={goals.some(goal => goal.goal === answers[0]) ? answers[0] : ""} onChange={event => updateAnswer(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 11, borderRadius: 9, border: "1px solid #bed1df", background: "#fff" }}><option value="">Choose a saved goal or write your own below</option>{goals.map(goal => <option key={goal.id} value={goal.goal}>{goal.goal}</option>)}</select></label>}
              <textarea value={answers[step]} onChange={event => updateAnswer(event.target.value)} rows={4} maxLength={2000} aria-label={prompts[step].label} style={{ display: "block", boxSizing: "border-box", width: "100%", padding: 13, borderRadius: 10, border: "1px solid #bed1df", resize: "vertical", font: "inherit" }} />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setStep(Math.max(0, step - 1)); setMessage(""); }} disabled={step === 0} className="ci-secondary">Back</button>
                <button type="button" onClick={continueSession} className="ci-primary">{step === prompts.length - 1 ? "Review my plan →" : "Continue →"}</button>
              </div>
            </div>
          )}
          {message && <p role="status" style={{ marginBottom: 0, marginTop: 16, padding: 12, borderRadius: 10, background: "#f4f8fb", color: "#26445b" }}>{message}</p>}
          <p style={{ margin: "18px 0 0", fontSize: 12, color: "#718394" }}>This is structured career reflection and planning, not therapy or a promise of employment. You can connect with a professional CareerDev Coach for human support.</p>
        </div>
      </div>
    </section>
  );
}
