"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { advanceCareerCoachSession, careerCoachAnswerLimit, type CareerCoachSession } from "../../lib/ai/career-coach-session";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

const sessionFields = "revision,next_step,answers,saved_goal_id";
const prompts = [
  { title: "Career goal", label: "What career outcome are you working toward?", hint: "Choose a role, transition, promotion, or milestone you can describe in one sentence." },
  { title: "Main barrier", label: "What is getting in the way?", hint: "Think about the first obstacle you can influence, such as time, feedback, practice, or access to information." },
  { title: "Seven-day action", label: "What can you do about that barrier in the next seven days?", hint: "Pick one action within your control. For example, ask a colleague for feedback on a work sample by Friday." },
  { title: "Progress evidence", label: "How will you know you did it?", hint: "Name something you can check, such as a sent request, a revised draft, or a practice exercise you completed." },
];

type Goal = { id: string; goal: string };
type Access = "loading" | "sign_in" | "locked" | "error" | "allowed";

export default function CareerCoachPanel() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [access, setAccess] = useState<Access>("loading");
  const [userId, setUserId] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [targetRole, setTargetRole] = useState("");
  const [session, setSession] = useState<CareerCoachSession | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const operation = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let live = true;

    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;
        if (!live) return;
        if (!user) { setAccess("sign_in"); return; }

        const [profile, entitlement, registry] = await Promise.all([
          supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle(),
          supabase.rpc("get_my_ai_agent_access", { p_agent_key: "career_coach_agent" }),
          supabase.from("ai_agent_registry").select("active").eq("agent_key", "career_coach_agent").eq("owner_role", "client_coach").maybeSingle(),
        ]);
        if (!live) return;
        if (profile.error || entitlement.error || registry.error) throw new Error("Access lookup failed");
        const permission = Array.isArray(entitlement.data) ? entitlement.data[0] : entitlement.data;
        if (profile.data?.status !== "active" || !["client", "coach", "staff", "admin"].includes(profile.data.role) || permission?.allowed !== true || registry.data?.active !== true) {
          setAccess("locked");
          return;
        }

        const [draft, client] = await Promise.all([
          supabase.from("career_coach_sessions").select(sessionFields).eq("user_id", user.id).maybeSingle(),
          supabase.from("clients").select("id").eq("profile_id", user.id).eq("status", "active").maybeSingle(),
        ]);
        if (!live) return;
        if (draft.error || client.error) throw new Error("Session lookup failed");
        setUserId(user.id);
        setCanPublish(Boolean(client.data?.id));

        let foundGoals: Goal[] = [];
        let foundTargetRole = "";
        if (client.data?.id) {
          const clientId = client.data.id;
          const [savedGoals, careerProfile] = await Promise.all([
            supabase.from("career_goals").select("id,goal").eq("client_id", clientId).eq("status", "active").not("goal", "like", "Career Coach action:%").order("priority").order("created_at", { ascending: false }).limit(10),
            supabase.from("career_profiles").select("target_role").eq("client_id", clientId).eq("is_current", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          if (!live) return;
          foundGoals = savedGoals.data ?? [];
          foundTargetRole = careerProfile.data?.target_role ?? "";
          if (savedGoals.error || careerProfile.error) setMessage("Some saved career context could not be loaded. You can still enter an outcome.");
          setGoals(foundGoals);
          setTargetRole(foundTargetRole);
        }

        if (draft.data) {
          setSession(draft.data);
          setStep(draft.data.next_step);
          setAnswers(draft.data.answers);
        } else {
          setAnswers([(foundGoals[0]?.goal || foundTargetRole).slice(0, careerCoachAnswerLimit), "", "", ""]);
        }
        setAccess("allowed");
      } catch {
        if (live) setAccess("error");
      }
    }

    void load();
    return () => { live = false; };
  }, [supabase]);

  function updateAnswer(value: string) {
    setAnswers(current => current.map((answer, index) => index === step ? value : answer));
    setMessage("");
  }

  async function runOperation(action: () => Promise<void>, fallback: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallback);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function continueSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runOperation(async () => {
      const progress = advanceCareerCoachSession(step, answers);
      const record = { ...progress, revision: crypto.randomUUID() };
      const table = supabase.from("career_coach_sessions");
      const write = session
        ? table.update({ ...record, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("revision", session.revision)
        : table.insert({ ...record, user_id: userId });

      const { data, error } = await write.select(sessionFields).maybeSingle();
      if (error?.code === "23505" || (!error && !data)) throw new Error("This plan changed in another tab. Reload to resume the latest saved step.");
      if (error || !data) throw new Error("Could not save this step. Your answer is still here. Try again.");

      setSession(data);
      setAnswers(data.answers);
      setStep(data.next_step);
      requestAnimationFrame(() => heading.current?.focus());
    }, "Could not save this coaching step. Try again.");
  }

  function saveAction() {
    if (!session || session.next_step !== prompts.length || session.saved_goal_id || !canPublish) return;

    void runOperation(async () => {
      const { data, error } = await supabase.rpc("save_my_career_coach_action", { p_revision: session.revision });
      if (error?.code === "40001") throw new Error("The plan changed in another tab. Reload before saving the action.");
      if (error || typeof data !== "string") throw new Error("Could not add the action to Career Goals. Your coaching plan is still saved.");
      setSession({ ...session, saved_goal_id: data });
      setMessage("Your action and progress evidence are in Career Goals with a seven-day target.");
    }, "Could not add the action to Career Goals. Try again.");
  }

  function startAgain() {
    if (!session) return;
    void runOperation(async () => {
      const { data, error } = await supabase.from("career_coach_sessions").delete()
        .eq("user_id", userId).eq("revision", session.revision).select("revision").maybeSingle();
      if (error || !data) throw new Error("Could not clear this plan. Reload to see the latest saved session.");
      setSession(null);
      setAnswers([(goals[0]?.goal || targetRole).slice(0, careerCoachAnswerLimit), "", "", ""]);
      setStep(0);
      requestAnimationFrame(() => heading.current?.focus());
    }, "Could not clear the saved session. Try again.");
  }

  const currentPrompt = prompts[step];
  return (
    <section className="ci-section" id="career-coach">
      <div className="ci-container">
        <div className="ci-section-heading">
          <div><h2>Turn a career goal into one clear next step.</h2><p>Choose a goal, identify a barrier, pick a seven-day action, and decide how to track it.</p></div>
        </div>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(20px,4vw,34px)", borderRadius: 18, background: "#fff", border: "1px solid #d8e6f1", boxShadow: "0 12px 36px rgba(0,45,90,.08)" }} aria-busy={busy}>
          {access === "loading" ? <p role="status">Loading your coaching session…</p> : access === "sign_in" ? (
            <div><p>Sign in to start or resume your coaching session.</p><a className="ci-primary" href="/account">Sign in</a></div>
          ) : access === "locked" ? (
            <div><p>Career Coach is available to eligible CareerDev accounts.</p><a className="ci-secondary" href="/agents">View agent access</a></div>
          ) : access === "error" ? (
            <div><p role="alert">Career Coach could not load your account or saved session.</p><button className="ci-secondary" onClick={() => window.location.reload()}>Try again</button></div>
          ) : !currentPrompt ? (
            <div>
              <h3 ref={heading} tabIndex={-1}>Your coaching plan</h3>
              <dl style={{ display: "grid", gap: 12, margin: "18px 0" }}>
                {prompts.map((prompt, index) => <div key={prompt.title} style={{ padding: 14, borderRadius: 12, background: "#f5f9fc" }}><dt style={{ fontWeight: 800, color: "#0b5d9b" }}>{prompt.title}</dt><dd style={{ margin: "5px 0 0", whiteSpace: "pre-wrap" }}>{answers[index]}</dd></div>)}
              </dl>
              {session?.saved_goal_id && <p><a href="/career-intelligence#profile">View the saved action in Career Intelligence</a></p>}
              {canPublish && !session?.saved_goal_id && <p>Saving to Career Goals adds only the action and progress evidence, with a seven-day target.</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {canPublish && !session?.saved_goal_id && <button type="button" onClick={saveAction} disabled={busy} className="ci-primary">Save action to Career Goals</button>}
                {!session?.saved_goal_id && <button type="button" onClick={() => { setStep(3); setMessage(""); }} disabled={busy} className="ci-secondary">Edit plan</button>}
                <button type="button" onClick={startAgain} disabled={busy} className="ci-secondary">{session?.saved_goal_id ? "Start another session" : "Discard plan and start over"}</button>
              </div>
            </div>
          ) : (
            <form onSubmit={continueSession}>
              <span className="ci-overline">Step {step + 1} of {prompts.length}</span>
              <h3 ref={heading} tabIndex={-1} style={{ margin: "12px 0 8px" }}><label htmlFor="coach-answer">{currentPrompt.label}</label></h3>
              <p id="coach-answer-hint" style={{ color: "#607487", marginTop: 0 }}>{currentPrompt.hint}</p>
              {step > 0 && <p style={{ color: "#527085" }}><strong>{prompts[step - 1].title}</strong> {answers[step - 1]}</p>}
              {step === 0 && goals.length > 0 && <label style={{ display: "block", margin: "12px 0", fontWeight: 700 }}>Use a saved career goal<select value={goals.find(goal => goal.goal.slice(0, careerCoachAnswerLimit) === answers[0])?.id || ""} onChange={event => updateAnswer((goals.find(goal => goal.id === event.target.value)?.goal || "").slice(0, careerCoachAnswerLimit))} disabled={busy} style={{ display: "block", width: "100%", marginTop: 6, padding: 11, borderRadius: 9, border: "1px solid #bed1df", background: "#fff" }}><option value="">Write your own goal</option>{goals.map(goal => <option key={goal.id} value={goal.id}>{goal.goal}</option>)}</select></label>}
              <textarea id="coach-answer" value={answers[step]} onChange={event => updateAnswer(event.target.value)} rows={4} maxLength={careerCoachAnswerLimit} required disabled={busy} aria-describedby="coach-answer-hint" style={{ display: "block", boxSizing: "border-box", width: "100%", padding: 13, borderRadius: 10, border: "1px solid #bed1df", resize: "vertical", font: "inherit" }} />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setStep(step - 1); setMessage(""); }} disabled={step === 0 || busy} className="ci-secondary">Back</button>
                <button type="submit" disabled={busy} className="ci-primary">{busy ? "Saving…" : step === prompts.length - 1 ? "Save and review plan" : "Save and continue"}</button>
              </div>
              <p style={{ color: "#527085", marginBottom: 0 }}>Each completed step is saved to your account so you can resume later. This guided session uses no AI credits.</p>
            </form>
          )}
          {message && <p role="status" style={{ marginBottom: 0, marginTop: 16, padding: 12, borderRadius: 10, background: "#f4f8fb", color: "#26445b" }}>{message}</p>}
        </div>
      </div>
    </section>
  );
}
