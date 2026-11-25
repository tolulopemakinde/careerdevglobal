"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase-browser";
import {
  buildStructuredResult, structuredClientCoachAgents, supportsGuidedWorksheet, validateStructuredRequest, type StructuredAgentKey,
} from "../../../supabase/functions/careerdev-ai-agent-runtime/client-coach-structured";

type Output = ReturnType<typeof buildStructuredResult>;
type Result = { executionId: string; output: Output };
type Access = "loading" | "sign-in" | "denied" | "testing" | "error" | "allowed";

export default function GuidedAgentWorkspace({ agentKey }: { agentKey: StructuredAgentKey }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [access, setAccess] = useState<Access>("loading");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const running = useRef(false);
  const agent = structuredClientCoachAgents[agentKey];

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!current) return;
        if (!auth.user) { setAccess("sign-in"); return; }
        const [profile, registry, access] = await Promise.all([
          supabase.from("profiles").select("role,status").eq("id", auth.user.id).maybeSingle(),
          supabase.from("ai_agent_registry").select("active,status,ai_dependency_mode").eq("agent_key", agentKey).eq("owner_role", "client_coach").maybeSingle(),
          supabase.rpc("get_my_ai_agent_access", { p_agent_key: agentKey }),
        ]);
        if (!current) return;
        if (profile.error || registry.error || access.error) throw new Error("Access lookup failed");
        const permission = Array.isArray(access.data) ? access.data[0] : access.data;
        if (profile.data?.status !== "active" || !["client", "coach", "staff", "admin"].includes(profile.data.role) ||
          permission?.allowed !== true || registry.data?.active !== true || !supportsGuidedWorksheet(registry.data.ai_dependency_mode)) {
          setAccess("denied");
        } else if (!["staff", "admin"].includes(profile.data.role) && registry.data.status !== "live") {
          setAccess("testing");
        } else {
          setAccess("allowed");
        }
      } catch {
        if (current) setAccess("error");
      }
    }

    void load();
    return () => { current = false; };
  }, [agentKey, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (access !== "allowed" || running.current) return;
    const request = validateStructuredRequest(agentKey, answers);
    if (!request) { setMessage("Complete each answer before continuing."); return; }

    running.current = true;
    setBusy(true);
    setResult(null);
    setMessage("");
    try {
      const started = await supabase.rpc("request_ai_agent_execution", {
        p_agent_key: agentKey,
        p_workflow_key: `${agentKey}_session`,
        p_trigger_source: "client_coach_structured_workspace",
        p_input_payload: { request },
      });
      if (started.error || typeof started.data !== "string") throw new Error("This workspace could not start the request. Check your agent access and try again.");
      const prepared = await supabase.rpc("prepare_ai_agent_execution", { p_request_id: started.data });
      const executionId = prepared.data?.execution_id;
      if (prepared.error || typeof executionId !== "string") throw new Error("Your request was created but could not be prepared.");
      const run = await supabase.functions.invoke("careerdev-ai-agent-runtime", { body: { request_id: started.data } });
      if (run.error) {
        let detail;
        try { detail = await run.error.context?.json?.(); } catch {}
        throw new Error(`${detail?.error || "This workspace could not finish the worksheet."} Execution ID ${executionId}.`);
      }
      if (run.data?.execution_id !== executionId || !["completed", "awaiting_human_review"].includes(run.data?.status) ||
        run.data?.output?.generated_by_ai !== false || typeof run.data?.output?.result?.title !== "string" ||
        !Array.isArray(run.data?.output?.result?.findings) || !Array.isArray(run.data?.output?.result?.next_steps) ||
        !Array.isArray(run.data?.output?.uncertainty_flags)) {
        throw new Error(`The workspace did not return a saved worksheet for execution ${executionId}.`);
      }
      setResult({ executionId, output: run.data.output });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This workspace could not finish. Your answers are still available.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  if (access === "loading") return <p role="status">Checking workspace access…</p>;
  if (access === "sign-in") return <p><a className="ci-primary" href="/account">Sign in to continue</a></p>;
  if (access === "testing") return <p>This guided worksheet is still in testing.</p>;
  if (access === "denied") return <p>This account does not have access to the worksheet. <a href="/agents">View your agent access</a></p>;
  if (access === "error") return <p role="alert">Could not check access. <button className="ci-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></p>;

  return (
    <>
      <p>Use your own Career Intelligence Profile and evidence to answer the questions. Your worksheet and answers are saved with the execution. This workflow uses no AI credits.</p>
      <form onSubmit={submit} aria-busy={busy}>
        {agent.fields.map(field => <div key={field.key} style={{ marginBottom: 16 }}>
          <label htmlFor={field.key}><strong>{field.label}</strong></label>
          <p id={`${field.key}-hint`} style={{ margin: "6px 0" }}>{field.hint}</p>
          <textarea id={field.key} value={answers[field.key] ?? ""} aria-describedby={`${field.key}-hint`} required disabled={busy} maxLength={2000} rows={3} onChange={e => setAnswers(current => ({ ...current, [field.key]: e.target.value }))} style={{ width: "100%", padding: 12, border: "1px solid #bed1df", borderRadius: 9, font: "inherit" }} />
        </div>)}
        <button type="submit" disabled={busy} className="ci-primary">{busy ? "Saving worksheet…" : "Create worksheet"}</button>
      </form>
      {message && <p role="alert">{message}</p>}
      {result && <section aria-live="polite" className="ci-card" style={{ marginTop: 24 }}>
        <h2>{result.output.result.title}</h2>
        <ul>{result.output.result.findings.map((item, index) => <li key={index}>{item}</li>)}</ul>
        <h3>Next steps</h3>
        <ol>{result.output.result.next_steps.map(item => <li key={item}>{item}</li>)}</ol>
        <p>{result.output.uncertainty_flags.join(" ")}</p>
        {result.output.human_review_required && <p>Awaiting human review.</p>}
        <small>Saved execution <code>{result.executionId}</code></small>
      </section>}
    </>
  );
}
