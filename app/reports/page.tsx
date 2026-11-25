"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";
import { downloadAgentReport, type ReportSource } from "../../lib/reports/report-text";
import { ReportCopyActions } from "../components/agent-report-actions";
import "../career-intelligence/styles.css";

type Summary = {
  id: string; owner_name: string; source: ReportSource; title: string;
  shared_coach_id: string | null; created_at: string;
};
const pageSize = 20;

export default function ReportsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<"mine" | "shared">("mine");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Summary[]>([]);
  const [open, setOpen] = useState<{ summary: Summary; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [viewReady, setViewReady] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "shared") setMode("shared");
    setViewReady(true);
  }, []);

  useEffect(() => {
    if (!viewReady) return;
    let current = true;
    async function load() {
      setLoading(true);
      setMessage("");
      setOpen(null);
      setRows([]);
      const { data: auth } = await supabase.auth.getUser();
      if (!current) return;
      if (!auth.user) { setSignedIn(false); setLoading(false); return; }
      setSignedIn(true);
      const query = supabase.from("saved_agent_reports")
        .select("id,owner_name,source,title,shared_coach_id,created_at")
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);
      const { data, error } = await (mode === "mine" ? query.eq("owner_id", auth.user.id) : query.neq("owner_id", auth.user.id));
      if (!current) return;
      if (error) setMessage("Reports could not be loaded. Refresh and try again.");
      else setRows(data as Summary[]);
      setLoading(false);
    }
    void load();
    return () => { current = false; };
  }, [mode, page, supabase, viewReady]);

  async function openReport(summary: Summary) {
    setLoadingReport(true);
    setOpen(null);
    setMessage("");
    const { data, error } = await supabase.from("saved_agent_reports")
      .select("body,shared_coach_id").eq("id", summary.id).maybeSingle();
    if (error || !data) setMessage("This report is no longer available to your account.");
    else setOpen({ summary: { ...summary, shared_coach_id: data.shared_coach_id }, body: data.body });
    setLoadingReport(false);
  }

  return <main className="ci-page"><section className="ci-section"><div className="ci-container">
    <a href="/agents">AI agents</a>
    <h1>Reports</h1>
    {!signedIn ? <p><a href="/account">Sign in to see your reports</a></p> : <>
      <div aria-label="Report views" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="ci-secondary" disabled={loadingReport} aria-pressed={mode === "mine"} onClick={() => { setPage(0); setMode("mine"); }}>My reports</button>
        <button type="button" className="ci-secondary" disabled={loadingReport} aria-pressed={mode === "shared"} onClick={() => { setPage(0); setMode("shared"); }}>Shared with me</button>
      </div>
      {loading ? <p role="status">Loading reports…</p> : !rows.length && !message ? <p>{mode === "mine" ? "Reports you save from an agent appear here." : "Reports shared with your coach account appear here."}</p> : (
        <ul>{rows.slice(0, pageSize).map(row => <li key={row.id} style={{ margin: "12px 0" }}>
          <button type="button" className="ci-secondary" disabled={loadingReport} onClick={() => void openReport(row)}>{row.title}</button>{" "}
          {mode === "shared" && <span>From {row.owner_name}</span>}
        </li>)}</ul>
      )}
      {(page > 0 || rows.length > pageSize) && <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="ci-secondary" disabled={page === 0 || loading || loadingReport} onClick={() => setPage(page - 1)}>Previous</button>
        <button type="button" className="ci-secondary" disabled={rows.length <= pageSize || loading || loadingReport} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
      {message && <p role="status">{message}</p>}
      {open && <article className="ci-card" style={{ marginTop: 20 }}>
        <h2>{open.summary.title}</h2>
        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{open.body}</div>
        {mode === "mine" ? <ReportCopyActions key={open.summary.id} report={{ source: open.summary.source, title: open.summary.title, body: open.body }} savedCopy={{ id: open.summary.id, shared_coach_id: open.summary.shared_coach_id }} /> :
          <button type="button" className="ci-secondary" style={{ marginTop: 12 }} onClick={() => downloadAgentReport(open.summary.title, open.body)}>Download report</button>}
      </article>}
    </>}
  </div></section></main>;
}
