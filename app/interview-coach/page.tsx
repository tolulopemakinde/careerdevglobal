"use client";

import { FormEvent, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type Turn = { speaker: "interviewer" | "candidate"; content: string; competency?: string; feedback?: string };
type CriterionAssessment = { criterion: string; assessment: "strong_evidence" | "partial_evidence" | "not_demonstrated"; evidence: string; gap: string; next_step: string };
type Scorecard = { overall: string; strengths: string[]; improvements: string[]; practice_plan: string[]; criteria_assessments: CriterionAssessment[] };

async function getFunctionErrorMessage(error: unknown, data: unknown, fallback: string): Promise<string> {
  const result = data as { error?: unknown } | null;
  if (typeof result?.error === "string") return result.error;
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as { clone?: unknown }).clone === "function") {
    try {
      const body = await (context as Response).clone().json() as { error?: unknown };
      if (typeof body?.error === "string") return body.error;
    } catch { /* Keep the SDK fallback if there is no JSON response. */ }
  }
  return error instanceof Error ? error.message : fallback;
}

export default function InterviewCoachPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [jobRole, setJobRole] = useState("");
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [candidateContext, setCandidateContext] = useState("");
  const [companyContext, setCompanyContext] = useState("");
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [jobCriteria, setJobCriteria] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setMessage("Sign in to use Interview Coach."); setBusy(false); return; }
    const { data, error } = await supabase.functions.invoke("careerdev-interview-coach", {
      body: {
        action: "start", job_role: jobRole, industry, company_name: company,
        job_description: jobDescription, candidate_context: candidateContext,
        company_context: companyContext,
        question_limit: 6, external_ai_consent: consent,
      },
    });
    if (error || data?.error) {
      setMessage(await getFunctionErrorMessage(error, data, "Could not start practice."));
      setBusy(false); return;
    }
    setSessionId(data.session_id);
    setJobCriteria(Array.isArray(data.job_criteria) ? data.job_criteria : []);
    setTurns([{ speaker: "interviewer", content: data.question, competency: data.competency }]);
    setBusy(false);
  }

  async function respond(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || !sessionId) return;
    setBusy(true); setMessage("");
    const candidateAnswer = answer.trim();
    const { data, error } = await supabase.functions.invoke("careerdev-interview-coach", {
      body: { action: "respond", session_id: sessionId, answer: candidateAnswer },
    });
    if (error || data?.error) {
      setMessage(await getFunctionErrorMessage(error, data, "Your answer could not be processed. Try again."));
      setAnswer(candidateAnswer);
      setBusy(false); return;
    }
    setAnswer("");
    setTurns((current) => [...current,
      { speaker: "candidate", content: candidateAnswer },
      { speaker: "interviewer", content: data.finished ? "Interview practice complete." : data.question, competency: data.competency, feedback: data.answer_feedback },
    ]);
    if (data.final_feedback) setScorecard(data.final_feedback);
    setBusy(false);
  }

  return (
    <main>
      <section className="hero" aria-labelledby="interview-coach-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">CAREER DEVELOPMENT • INTERVIEW PRACTICE</p>
            <h1 id="interview-coach-title">Interview Coach</h1>
            <p className="lead">Prepare for a specific opportunity with role-targeted questions, evidence-focused follow-ups, and practical feedback based on the information you provide.</p>
            <div className="actions">
              <a className="button primary" href="#practice-form">Start practice</a>
              <a className="button secondary" href="/agents">Explore AI Agents</a>
            </div>
            <div className="trust-row"><span>Role-targeted questions</span><span>Interactive practice</span><span>Actionable feedback</span></div>
          </div>
          <div className="hero-card" aria-label="Interview practice steps">
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".14em", color: "#1764df" }}>YOUR PRACTICE FLOW</div>
            <div className="journey">
              <span>Role</span><b aria-hidden="true">→</b><span>Criteria</span><b aria-hidden="true">→</b><span>Practice</span><b aria-hidden="true">→</b><span>Feedback</span>
            </div>
            <p>Questions are tailored to the job description and company notes you share. Your final review highlights evidence, gaps, and next steps.</p>
          </div>
        </div>
      </section>

      <section id="practice-form" className="container" style={{ maxWidth: 900, padding: "40px 0 70px", color: "#09233f" }}>
        <a href="/agents" style={{ color: "#0b5d9b", fontWeight: 800 }}>← AI Agents</a>
        <h2 style={{ marginTop: 12 }}>Build your mock interview</h2>
        <p>Share the role details and experience you want to practice with. Links are not opened, so paste the relevant text directly.</p>
        <aside style={{ padding: 14, border: "1px solid #ecd9a8", borderRadius: 10, background: "#fff9e9", lineHeight: 1.5 }}>
          Zero-cost pilot: this flow uses Groq only when its Free-tier account is explicitly confirmed. No paid-model fallback or live company search is used. Links are not opened; paste relevant job and experience text. Do not include sensitive personal information.
        </aside>

      {!sessionId ? (
        <form onSubmit={start} style={{ display: "grid", gap: 14, marginTop: 22 }}>
          <label>Target job role<input required maxLength={160} value={jobRole} onChange={(e) => setJobRole(e.target.value)} style={inputStyle} placeholder="e.g. Human Resources Manager" /></label>
          <label>Industry<input required maxLength={160} value={industry} onChange={(e) => setIndustry(e.target.value)} style={inputStyle} placeholder="e.g. Financial services" /></label>
          <label>Company<input required maxLength={200} value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} /></label>
          <label>Job description<textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} maxLength={16000} rows={7} style={inputStyle} placeholder="Paste the job posting or role requirements." /></label>
          <label>Your relevant experience<textarea value={candidateContext} onChange={(e) => setCandidateContext(e.target.value)} maxLength={8000} rows={5} style={inputStyle} placeholder="Optional: paste relevant CV or LinkedIn experience and project examples. Links themselves are not read." /></label>
          <label>Company notes<textarea value={companyContext} onChange={(e) => setCompanyContext(e.target.value)} maxLength={8000} rows={4} style={inputStyle} placeholder="Optional: paste verified values, products, or role-specific company information." /></label>
          <label style={{ display: "flex", gap: 10, alignItems: "start" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>I consent to sending the information entered here to Groq for this mock interview. I understand the feature uses a free-tier service and is not a hiring decision or a job guarantee.</span>
          </label>
          <button disabled={busy || !consent} style={buttonStyle}>{busy ? "Starting…" : "Start mock interview"}</button>
        </form>
      ) : (
        <section style={{ marginTop: 24 }}>
          {jobCriteria.length > 0 && <aside style={{ marginBottom: 16, padding: 14, border: "1px solid #d8e6f1", borderRadius: 10, background: "#f3f8fc" }}><strong>Role criteria guiding this practice</strong><ul>{jobCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></aside>}
          <div style={{ display: "grid", gap: 12 }}>
            {turns.map((turn, index) => (
              <article key={index} style={{ padding: 16, borderRadius: 12, border: "1px solid #d8e6f1", background: turn.speaker === "interviewer" ? "#f3f8fc" : "#fff" }}>
                <strong>{turn.speaker === "interviewer" ? "Interviewer" : "Your answer"}</strong>
                {turn.competency && <small style={{ marginLeft: 10, color: "#527085" }}>Focus: {turn.competency}</small>}
                <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginBottom: 4 }}>{turn.content}</p>
                {turn.feedback && <p style={{ borderLeft: "3px solid #1671b9", paddingLeft: 10, color: "#385c75" }}>Practice feedback: {turn.feedback}</p>}
              </article>
            ))}
          </div>
          {!scorecard && <form onSubmit={respond} style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <label>Your answer<textarea required maxLength={8000} rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} style={inputStyle} /></label>
            <button disabled={busy || !answer.trim()} style={buttonStyle}>{busy ? "Thinking…" : "Submit answer"}</button>
          </form>}
          {scorecard && <article style={{ marginTop: 20, padding: 18, borderRadius: 12, background: "#eef7f0", border: "1px solid #c4dfca" }}>
            <h2>Practice summary</h2><p>{scorecard.overall}</p>
            {scorecard.criteria_assessments?.length > 0 && <><h3>Role criteria review</h3><div style={{ display: "grid", gap: 10 }}>{scorecard.criteria_assessments.map((item, i) => <div key={i} style={{ padding: 12, border: "1px solid #cbd8e2", borderRadius: 8, background: "#fff" }}><strong>{item.criterion}</strong><p style={{ marginBottom: 4 }}>Assessment: {item.assessment.replaceAll("_", " ")}</p><p style={{ margin: "4px 0" }}><b>Evidence:</b> {item.evidence}</p><p style={{ margin: "4px 0" }}><b>Gap:</b> {item.gap}</p><p style={{ margin: "4px 0" }}><b>Next step:</b> {item.next_step}</p></div>)}</div></>}
            <h3>Strengths</h3><ul>{scorecard.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <h3>Areas to improve</h3><ul>{scorecard.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <h3>Next practice steps</h3><ul>{scorecard.practice_plan.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </article>}
        </section>
      )}
      {message && <p role="alert" style={{ marginTop: 16, color: "#9b2c2c" }}>{message}</p>}
    </main>
  );
}

const inputStyle = { display: "block", width: "100%", boxSizing: "border-box" as const, marginTop: 6, padding: 11, border: "1px solid #cbd8e2", borderRadius: 8, font: "inherit" };
const buttonStyle = { padding: "12px 16px", border: 0, borderRadius: 9, background: "#0b5d9b", color: "#fff", fontWeight: 800, cursor: "pointer" as const };
