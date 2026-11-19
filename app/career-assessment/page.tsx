"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type Assessment = { id: string; name: string; description: string };
type Option = { value: string; label: string; category: string };
type Question = { id: string; question: string; question_type: string; options: Option[]; position: number };
type Profile = {
  current_job_title?: string | null;
  current_industry?: string | null;
  target_role?: string | null;
  target_roles?: string[] | null;
  target_industry?: string | null;
  target_industries?: string[] | null;
  career_interests?: string[] | null;
  interests?: string | null;
  strengths_summary?: string | null;
  development_gaps_summary?: string | null;
  development_gaps?: string[] | null;
  professional_summary?: string | null;
  achievements?: string | null;
  certifications?: string | null;
  leadership_experience?: string | null;
  portfolio_evidence?: string | null;
};
type Answer = { option_key: string; label: string; category: string; source: "self_report" };

const categoryLabels: Record<string, string> = {
  people_community: "People & community",
  analysis_problem_solving: "Analysis & problem-solving",
  communication_storytelling: "Communication & storytelling",
  building_operations: "Building & operations",
};
const examples: Record<string, string[]> = {
  people_community: ["community and social programmes", "education and learning support", "client or people services"],
  analysis_problem_solving: ["research and insights", "monitoring, evaluation and learning", "data and analytical work"],
  communication_storytelling: ["communications and content", "advocacy and public engagement", "marketing and storytelling"],
  building_operations: ["project and programme delivery", "operations and logistics", "service or product implementation"],
};
const box: CSSProperties = {
  background: "#fff",
  border: "1px solid #d8e6f1",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 8px 25px rgba(0,60,100,.05)",
};
const blueButton: CSSProperties = {
  padding: "11px 15px",
  border: 0,
  borderRadius: 9,
  background: "#0b5d9b",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

export default function CareerAssessmentPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [profile, setProfile] = useState<Profile>({});
  const [goals, setGoals] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [accessError, setAccessError] = useState("");
  const [saving, setSaving] = useState(false);
  const [goalSaved, setGoalSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        if (mounted) {
          setAccessError("Sign in to start Career Assessment.");
          setLoading(false);
        }
        return;
      }
      if (mounted) setEmail(user.email || "");
      const [{ data: person }, { data: accessRows, error: accessError }] = await Promise.all([
        supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle(),
        supabase.rpc("get_my_ai_agent_access", { p_agent_key: "career_assessment_agent" }),
      ]);
      const access = Array.isArray(accessRows) ? accessRows[0] : accessRows;
      if (!person || person.status !== "active" || !["client", "coach"].includes(person.role)) {
        if (mounted) {
          setAccessError("Career Assessment is available to active Clients and Coaches.");
          setLoading(false);
        }
        return;
      }
      if (accessError || !access?.allowed) {
        if (mounted) {
          setAccessError("Career Assessment is not included in the active AI Agent access for this account.");
          setLoading(false);
        }
        return;
      }

      const { data: client } = await supabase.from("clients").select("id").eq("profile_id", user.id).maybeSingle();
      if (!client?.id) {
        if (mounted) {
          setAccessError("A client profile is needed to save assessment responses.");
          setLoading(false);
        }
        return;
      }
      if (mounted) setClientId(client.id);

      const [{ data: assessmentRows }, { data: profileRow }, { data: goalRows }] = await Promise.all([
        supabase.from("assessments").select("id,name,description").eq("assessment_type", "career_direction").eq("active", true).order("version", { ascending: false }).limit(1),
        supabase.from("career_profiles").select("current_job_title,current_industry,target_role,target_roles,target_industry,target_industries,career_interests,interests,strengths_summary,development_gaps_summary,development_gaps,professional_summary,achievements,certifications,leadership_experience,portfolio_evidence").eq("client_id", client.id).eq("is_current", true).maybeSingle(),
        supabase.from("career_goals").select("goal").eq("client_id", client.id).order("priority", { ascending: true }).limit(10),
      ]);
      const currentAssessment = assessmentRows?.[0] as Assessment | undefined;
      if (!currentAssessment) {
        if (mounted) {
          setAccessError("The Career Direction Assessment is not configured yet.");
          setLoading(false);
        }
        return;
      }
      const [{ data: questionRows }, { data: responseRows }] = await Promise.all([
        supabase.from("assessment_questions").select("id,question,question_type,options,position").eq("assessment_id", currentAssessment.id).order("position"),
        supabase.from("assessment_responses").select("question_id,response").eq("assessment_id", currentAssessment.id).eq("client_id", client.id),
      ]);
      const list = (questionRows || []) as Question[];
      const restored: Record<string, Answer> = {};
      (responseRows || []).forEach((row) => {
        const response = row.response as Partial<Answer> | null;
        if (response?.option_key && response.category && response.label) {
          restored[row.question_id] = { option_key: response.option_key, category: response.category, label: response.label, source: "self_report" };
        }
      });
      if (mounted) {
        setAssessment(currentAssessment);
        setQuestions(list);
        setProfile((profileRow || {}) as Profile);
        setGoals((goalRows || []).map((row) => row.goal).filter(Boolean) as string[]);
        setAnswers(restored);
        const firstUnanswered = list.findIndex((question) => !restored[question.id]);
        setStep(firstUnanswered < 0 ? list.length : firstUnanswered);
        setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function choose(question: Question, option: Option) {
    if (!clientId || !assessment) return;
    setSaving(true);
    setNotice("");
    const answer: Answer = { option_key: option.value, label: option.label, category: option.category, source: "self_report" };
    const { error } = await supabase.from("assessment_responses").upsert({
      assessment_id: assessment.id,
      question_id: question.id,
      client_id: clientId,
      response: answer,
    }, { onConflict: "question_id,client_id" });
    setSaving(false);
    if (error) {
      setNotice("Your answer could not be saved. Please retry before moving on.");
      return;
    }
    setAnswers((previous) => ({ ...previous, [question.id]: answer }));
    setNotice("Answer saved to your account.");
  }

  const counts = Object.values(answers).reduce((totals, answer) => {
    totals[answer.category] = (totals[answer.category] || 0) + 1;
    return totals;
  }, {} as Record<string, number>);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const complete = questions.length > 0 && questions.every((question) => Boolean(answers[question.id]));
  const leaders = ranked.length ? ranked.filter(([, count]) => count === ranked[0][1]) : [];
  const topCategories = leaders.map(([category]) => category);
  const currentQuestion = questions[step];
  const profileFacts = [
    profile.current_job_title && `Current role: ${profile.current_job_title}`,
    profile.current_industry && `Current industry: ${profile.current_industry}`,
    (profile.target_roles?.length || profile.target_role) && `Target roles: ${profile.target_roles?.join(", ") || profile.target_role}`,
    (profile.target_industries?.length || profile.target_industry) && `Target industries: ${profile.target_industries?.join(", ") || profile.target_industry}`,
    (profile.career_interests?.length || profile.interests) && `Saved interests: ${profile.career_interests?.join(", ") || profile.interests}`,
    profile.professional_summary && `Professional summary: ${profile.professional_summary}`,
    profile.achievements && `Saved achievements: ${profile.achievements}`,
    profile.certifications && `Saved certifications: ${profile.certifications}`,
    profile.leadership_experience && `Saved leadership experience: ${profile.leadership_experience}`,
    profile.portfolio_evidence && `Saved portfolio evidence: ${profile.portfolio_evidence}`,
    profile.strengths_summary && `Saved strengths: ${profile.strengths_summary}`,
    (profile.development_gaps?.length || profile.development_gaps_summary) && `Saved development priorities: ${profile.development_gaps?.join(", ") || profile.development_gaps_summary}`,
  ].filter(Boolean) as string[];

  async function saveExplorationGoal() {
    if (!clientId || !topCategories.length || goalSaved) return;
    const goalNames = topCategories.map((category) => categoryLabels[category] || category);
    const { error } = await supabase.from("career_goals").insert({
      client_id: clientId,
      goal: `Explore career areas related to ${goalNames.join(" and ")}`,
      priority: 2,
    });
    setNotice(error ? "The result is ready, but the exploration goal could not be saved." : "Exploration goal saved to your profile.");
    if (!error) setGoalSaved(true);
  }

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f7fbff,#eef6fb)", color: "#09233f", padding: "28px 16px 70px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <a href="/agents" style={{ color: "#0b5d9b", fontWeight: 800, textDecoration: "none" }}>← AI Agents</a>
        <section style={{ ...box, marginTop: 18, padding: "clamp(22px,5vw,44px)", color: "#fff", border: 0, background: "linear-gradient(120deg,#05264d,#0b5d9b)" }}>
          <div style={{ fontSize: 12, letterSpacing: 1, fontWeight: 900, textTransform: "uppercase", opacity: .85 }}>Career Intelligence · Evidence-based assessment</div>
          <h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)", lineHeight: 1.08, margin: "12px 0" }}>See which kinds of work you prefer</h1>
          <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.7, color: "rgba(255,255,255,.9)" }}>Answer eight short questions about tasks you choose and enjoy. Your saved career profile adds context, but only your explicit answers are scored. This is a reflection tool, not a personality test, aptitude test, or job-fit verdict.</p>
        </section>

        {loading ? <section style={{ ...box, marginTop: 18 }}>Loading assessment…</section> : !email ? (
          <section style={{ ...box, marginTop: 18 }}><h2>Sign in to continue</h2><p>{accessError}</p><a href="/account" style={blueButton}>Sign in / Create account</a></section>
        ) : accessError ? (
          <section style={{ ...box, marginTop: 18 }}><h2>Career Assessment access</h2><p>{accessError}</p><a href="/pricing" style={{ color: "#0b5d9b", fontWeight: 800 }}>View plans</a></section>
        ) : !questions.length ? (
          <section style={{ ...box, marginTop: 18 }}><h2>Assessment setup needed</h2><p>Question data has not been added to this environment yet. Please try again after the Career Assessment setup is complete.</p></section>
        ) : (
          <>
            <section style={{ ...box, marginTop: 18 }}>
              <h2 style={{ marginTop: 0 }}>Profile context</h2>
              <p style={{ color: "#527085" }}>{profileFacts.length ? "These saved details are shown for comparison; they do not change your answer scores." : "No saved profile details were found. Your responses can still produce an interest-pattern summary."}</p>
              {profileFacts.length > 0 && <ul style={{ lineHeight: 1.65, color: "#385970" }}>{profileFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>}
              <p style={{ marginBottom: 0, color: "#607487" }}><strong>Saved career goals:</strong> {goals.join("; ") || "none saved yet"}</p>
              <a href="/career-intelligence" style={{ display: "inline-block", marginTop: 12, color: "#0b5d9b", fontWeight: 800 }}>Update Career Intelligence profile →</a>
            </section>

            {!complete && currentQuestion && (
              <section style={{ ...box, marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#527085", fontSize: 13, fontWeight: 800 }}>
                  <span>Question {step + 1} of {questions.length}</span><span>{Object.keys(answers).length} answers saved</span>
                </div>
                <div style={{ marginTop: 8, height: 7, background: "#e6eef4", borderRadius: 99 }}><div style={{ width: `${Math.round(Object.keys(answers).length / questions.length * 100)}%`, height: "100%", borderRadius: 99, background: "#0b5d9b" }} /></div>
                <h2 style={{ marginTop: 22 }}>{currentQuestion.question}</h2>
                <div style={{ display: "grid", gap: 10 }}>
                  {currentQuestion.options.map((option) => {
                    const selected = answers[currentQuestion.id]?.option_key === option.value;
                    return <button key={option.value} type="button" disabled={saving} onClick={() => void choose(currentQuestion, option)} aria-pressed={selected} style={{ textAlign: "left", padding: 14, borderRadius: 11, border: selected ? "2px solid #0b5d9b" : "1px solid #cbdbe7", background: selected ? "#eef7fc" : "#fff", color: "#183b55", cursor: saving ? "wait" : "pointer", font: "inherit" }}>{option.label}{selected && <span style={{ display: "block", marginTop: 5, color: "#0b5d9b", fontSize: 12, fontWeight: 900 }}>Selected and saved</span>}</button>;
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
                  <button type="button" disabled={step === 0} onClick={() => { setStep((n) => Math.max(0, n - 1)); setNotice(""); }} style={{ ...blueButton, background: step === 0 ? "#dce6ed" : "#527085", color: step === 0 ? "#6d7f8c" : "#fff" }}>Previous</button>
                  <button type="button" disabled={!answers[currentQuestion.id] || saving} onClick={() => { setStep((n) => n + 1); setNotice(""); }} style={{ ...blueButton, opacity: !answers[currentQuestion.id] || saving ? .55 : 1 }}>Next →</button>
                </div>
                {notice && <p role="status" style={{ color: "#385970", fontWeight: 700 }}>{notice}</p>}
              </section>
            )}

            {complete && (
              <section style={{ ...box, marginTop: 18 }}>
                <div style={{ display: "inline-block", padding: "5px 9px", borderRadius: 99, background: "#e9f5ef", color: "#256341", fontWeight: 900, fontSize: 12 }}>Self-reported interest pattern</div>
                <h2>Your answers point to these work preferences</h2>
                <p style={{ color: "#527085", lineHeight: 1.6 }}>Each answer adds one point to its named category. The counts below summarize only the choices you made in this session; they do not establish a skill level or predict job success.</p>
                <div style={{ display: "grid", gap: 12 }}>
                  {ranked.map(([category, count]) => <div key={category} style={{ padding: 14, background: "#f7fbff", border: "1px solid #dbe8f1", borderRadius: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{categoryLabels[category] || category}</strong><span>{count} of {questions.length} choices</span></div>
                    <div style={{ height: 7, marginTop: 8, background: "#e2ebf1", borderRadius: 99 }}><div style={{ width: `${Math.round(count / questions.length * 100)}%`, height: "100%", background: "#0b5d9b", borderRadius: 99 }} /></div>
                  </div>)}
                </div>
                <h3>Illustrative areas to research</h3>
                {topCategories.map((category) => <div key={category} style={{ margin: "10px 0", padding: 14, borderLeft: "4px solid #0b5d9b", background: "#f7fbff" }}><strong>{categoryLabels[category]}</strong><p style={{ margin: "6px 0 0", color: "#527085" }}>{(examples[category] || []).join(" · ")}</p></div>)}
                <h3>Compare with your career profile</h3>
                <p style={{ color: "#527085", lineHeight: 1.6 }}>Review the interest pattern alongside your saved goals, work history, skills evidence, constraints, and target roles. The profile provides context; it is not included in the score.</p>
                <h3>Practical next steps</h3>
                <ol style={{ lineHeight: 1.7, color: "#385970" }}>
                  <li>Choose one illustrative area and review three current role descriptions or project examples.</li>
                  <li>Mark which repeated tasks match your preferences and which would be a poor fit.</li>
                  <li>Collect concrete evidence from work, study, volunteering, or community projects to compare with actual role requirements.</li>
                  <li>Discuss the result with a coach before making a major career decision.</li>
                </ol>
                <button type="button" onClick={() => void saveExplorationGoal()} disabled={goalSaved} style={{ ...blueButton, opacity: goalSaved ? .6 : 1 }}>{goalSaved ? "Exploration goal saved" : "Save this exploration as a career goal"}</button>
                {notice && <p role="status" style={{ color: "#385970", fontWeight: 700 }}>{notice}</p>}
                <p style={{ marginTop: 18, color: "#718394", fontSize: 13, lineHeight: 1.6 }}>This is transparent, zero-cost structured guidance; no paid AI model is called. The categories are conversation prompts and have not been validated as a psychometric instrument. No current job-market research was performed.</p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
