"use client";

import { useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";
import { downloadAgentReport, formatAgentReport, type ReportSection, type ReportSource } from "../../lib/reports/report-text";

type Coach = { coach_id: string; display_name: string };
type SavedCopy = { id: string; shared_coach_id: string | null };
type Report = { source: ReportSource; title: string; body: string };

export default function AgentReportActions({ source, title, sections }: {
  source: ReportSource;
  title: string;
  sections: readonly ReportSection[];
}) {
  const body = formatAgentReport(title, sections);
  return <ReportCopyActions key={`${source}:${body}`} report={{ source, title, body }} />;
}

export function ReportCopyActions({ report, savedCopy }: {
  report: Report;
  savedCopy?: SavedCopy;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [saved, setSaved] = useState<SavedCopy | null>(savedCopy ?? null);
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const sharePanel = useRef<HTMLDivElement>(null);

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The report action could not finish. Try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function ensureSaved(): Promise<SavedCopy> {
    if (saved) return saved;
    const title = Array.from(report.title.trim()).slice(0, 160).join("") || "CareerDev report";
    const result = await supabase.rpc("save_my_agent_report", { p_source: report.source, p_title: title, p_body: report.body });
    if (result.error?.code === "42501") throw new Error("Sign in with an active CareerDev account to save this report.");
    if (result.error?.code === "22023") throw new Error("This report could not be saved in the library format. You can still download it.");
    if (result.error || typeof result.data !== "string") throw new Error("The report could not be saved. Try again.");
    const { data, error } = await supabase.from("saved_agent_reports").select("id,shared_coach_id").eq("id", result.data).single();
    if (error || !data) throw new Error("The report was saved, but its sharing status could not be loaded. Open My reports to check it.");
    setSaved(data);
    return data;
  }

  function openShare() {
    void run(async () => {
      const { data, error } = await supabase.rpc("get_public_coach_directory").select("coach_id,display_name");
      if (error) throw new Error("The CareerDev Coach directory could not be loaded. Try again.");
      setCoaches(Array.isArray(data) ? data : []);
      setRecipient(saved?.shared_coach_id ?? "");
      requestAnimationFrame(() => sharePanel.current?.focus());
    });
  }

  function changeShare(coachId: string | null) {
    void run(async () => {
      const reportCopy = await ensureSaved();
      const { error } = await supabase.rpc("set_my_agent_report_coach", { p_report_id: reportCopy.id, p_coach_id: coachId });
      if (error) throw new Error(coachId ? "The report was saved, but sharing could not be completed. Check your sign-in and coach selection." : "Coach access could not be removed. Try again.");
      setSaved({ ...reportCopy, shared_coach_id: coachId });
      setCoaches(null);
      setMessage(coachId ? "The selected coach can now read this report in their CareerDev dashboard." : "The coach can no longer open this report in CareerDev.");
    });
  }

  return (
    <section aria-label="Report actions" aria-busy={busy} style={{ marginTop: 18 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {!savedCopy && <button type="button" className="ci-primary" disabled={busy || Boolean(saved)} onClick={() => void run(async () => { await ensureSaved(); setMessage("Report saved to My reports."); })}>{saved ? "Report saved" : "Save report"}</button>}
        <button type="button" className="ci-secondary" onClick={() => downloadAgentReport(report.title, report.body)}>Download report</button>
        <button type="button" className="ci-secondary" disabled={busy} onClick={openShare}>{saved?.shared_coach_id ? "Change coach sharing" : "Share with CareerDev Coach"}</button>
        {saved?.shared_coach_id && <button type="button" className="ci-secondary" disabled={busy} onClick={() => changeShare(null)}>Remove coach access</button>}
        {!savedCopy && <a href="/reports">My reports</a>}
      </div>
      {coaches && <div ref={sharePanel} tabIndex={-1} style={{ marginTop: 12 }}>
        {coaches.length ? <>
          <label>CareerDev Coach <select value={recipient} onChange={event => setRecipient(event.target.value)} disabled={busy}>
            <option value="">Choose a coach</option>
            {coaches.map(coach => <option key={coach.coach_id} value={coach.coach_id}>{coach.display_name}</option>)}
          </select></label>
          <p>This shares a saved copy of this report and your account name with the selected coach. Sharing with a different coach replaces the current coach’s access.</p>
          <button type="button" className="ci-primary" disabled={!recipient || busy} onClick={() => changeShare(recipient)}>Share report</button>{" "}
        </> : <p>No CareerDev Coaches are available to select right now. You can still save or download your report.</p>}
        <button type="button" className="ci-secondary" disabled={busy} onClick={() => setCoaches(null)}>Cancel</button>
      </div>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
