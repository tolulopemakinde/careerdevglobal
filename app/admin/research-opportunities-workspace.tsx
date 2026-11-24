'use client';

import { useMemo, useState } from 'react';
import { buildOpportunitySearchTerms, createOpportunityReport } from '../../lib/admin/research-opportunities-workspace.mjs';
import { toSpreadsheetCsv } from '../../lib/admin/lead-generation-workspace.mjs';
import { runResearchOpportunitiesDraft, researchDraftToMarkdown } from '../../lib/admin/research-opportunities-operational.mjs';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Opportunity = { id: string; title: string; type: string; organization: string; geography: string; deadline: string; sourceUrl: string; sourceReview: string; deadlineReview: string; notes: string };
const blankOpportunity = (): Opportunity => ({ id: '', title: '', type: '', organization: '', geography: '', deadline: '', sourceUrl: '', sourceReview: 'Not reviewed', deadlineReview: 'Not reviewed', notes: '' });
const columns = [
  { key: 'title', label: 'Opportunity' }, { key: 'type', label: 'Type' }, { key: 'organization', label: 'Organization' },
  { key: 'geography', label: 'Geography' }, { key: 'deadline', label: 'Deadline' }, { key: 'sourceUrl', label: 'Source URL' },
  { key: 'sourceReview', label: 'Source review' }, { key: 'deadlineReview', label: 'Deadline review' }, { key: 'notes', label: 'Notes' },
];

export default function ResearchOpportunitiesWorkspace({ onMessage, agentStatus, agentActive, humanApprovalRequired }: { onMessage: (message: string) => void; agentStatus: string; agentActive: boolean; humanApprovalRequired: boolean }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [criteria, setCriteria] = useState({ keywords: '', opportunityType: '', geography: '', targetProfile: '' });
  const [synthetic, setSynthetic] = useState({ title: '', excerpt: '', deadline: '', targetProfile: '' });
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [draft, setDraft] = useState<Opportunity>(blankOpportunity());
  const [aiDraft, setAiDraft] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
  const report = useMemo(() => createOpportunityReport(opportunities, criteria), [opportunities, criteria]);
  const fieldStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };
  async function openSearch() {
    try {
      const terms = buildOpportunitySearchTerms(criteria);
      window.open('https://www.google.com/', '_blank', 'noopener,noreferrer');
      await navigator.clipboard.writeText(terms);
      onMessage('Web search opened and terms copied. Search manually, prefer primary sources, and add only records you reviewed.');
    } catch (error: any) { onMessage(error?.message || 'Search could not open or terms could not be copied. You can copy the criteria manually.'); }
  }
  async function runSyntheticResearch() {
    if (!operationalReady || aiBusy) return;
    const keywords = criteria.keywords.trim();
    if (!keywords || !synthetic.title.trim() || !synthetic.excerpt.trim() || !synthetic.targetProfile.trim()) {
      onMessage('Enter synthetic keywords, a source title and excerpt, and a synthetic target profile before starting Groq.'); return;
    }
    if (synthetic.excerpt.length > 3000 || synthetic.title.length > 500 || synthetic.targetProfile.length > 1200 || synthetic.deadline.length > 80) {
      onMessage('Synthetic source title, excerpt, target profile, or date exceeds the allowed test limit.'); return;
    }
    const payload = {
      research_scope: { source: 'synthetic', keywords, opportunity_type: criteria.opportunityType.trim(), geography: criteria.geography.trim(), sources: [{ source: 'synthetic', title: synthetic.title.trim(), excerpt: synthetic.excerpt.trim(), deadline: synthetic.deadline.trim() }] },
      target_profile: { source: 'synthetic', description: synthetic.targetProfile.trim() },
    };
    setAiBusy(true); setAiDraft(null); setApprovalMessage('');
    try {
      const result = await runResearchOpportunitiesDraft(supabase, payload);
      setAiDraft(result);
      onMessage(`Synthetic research draft is awaiting human review. Estimated provider cost: $${Number(result.estimated_cost_usd || 0).toFixed(6)}.`);
    } catch (error: any) { onMessage(error?.message || 'Research & Opportunities could not produce a governed draft.'); }
    finally { setAiBusy(false); }
  }
  async function requestIndependentReview() {
    if (!aiDraft?.requestId || !aiDraft?.executionId || approvalBusy) return;
    setApprovalBusy(true); setApprovalMessage('');
    try {
      const { data, error } = await supabase.rpc('request_ai_human_approval', { p_request_id: aiDraft.requestId, p_execution_id: aiDraft.executionId });
      if (error || !data) throw new Error('No approval ID returned');
      setApprovalMessage('Independent review request created. Another authorized user must review it.');
      onMessage('Synthetic research draft queued for independent human review.');
    } catch {
      setApprovalMessage('Independent review request could not be created. Open AI Governance and inspect the execution.');
      onMessage('Independent Research & Opportunities review request could not be created.');
    } finally { setApprovalBusy(false); }
  }
  function downloadResearchDraft() {
    if (!aiDraft) return;
    const url = URL.createObjectURL(new Blob([researchDraftToMarkdown(aiDraft)], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'research-opportunities-synthetic-review.md'; anchor.click(); URL.revokeObjectURL(url);
  }
  function addOpportunity(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) { onMessage('Enter an opportunity title from your manual research.'); return; }
    if (!draft.sourceUrl.trim() || !/^https?:\/\//i.test(draft.sourceUrl.trim())) { onMessage('Enter the full http or https URL for the source you reviewed.'); return; }
    setOpportunities((current) => [...current, { ...draft, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: draft.title.trim(), sourceUrl: draft.sourceUrl.trim() }]);
    setDraft(blankOpportunity());
    onMessage('Opportunity added to this browser session. Verify eligibility and dates before sharing or acting.');
  }
  function exportCsv(name: string, rows: Record<string, any>[], csvColumns: Array<{ key: string; label: string }>) {
    const blob = new Blob([toSpreadsheetCsv(rows, csvColumns)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    URL.revokeObjectURL(url);
  }
  const reportColumns = Object.keys(report).map((key) => ({ key, label: key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase()) }));
  return <section style={{ marginTop: 18, background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Research & Opportunities workspace</h2>
    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#527085' }}>Prepare a research query, manually review source pages, record opportunities, and export a summary and list. Records remain in browser memory for this session.</p>
    <div role="note" style={{ padding: 12, borderRadius: 10, background: '#fff8e8', border: '1px solid #f0d18b', fontSize: 12, lineHeight: 1.6, color: '#624a20' }}><strong>Testing-only manual research.</strong> This workspace opens a search homepage and copies your terms. It does not scrape websites, use paid search services, call APIs or AI providers, save records to the database, or contact organizations. Verify details on primary sources; keep eligibility and deadlines marked unverified until checked by a human.</div>
    <h3 style={{ marginBottom: 8 }}>1. Research scope</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
      {([['keywords', 'Keywords'], ['opportunityType', 'Opportunity type'], ['geography', 'Geography'], ['targetProfile', 'Target profile or interests']] as const).map(([key, label]) => <label key={key} style={labelStyle}>{label}<input value={criteria[key]} onChange={(event) => setCriteria((current) => ({ ...current, [key]: event.target.value }))} style={fieldStyle} placeholder={key === 'keywords' ? 'e.g. youth livelihoods grant' : `Optional ${label.toLowerCase()}`} /></label>)}
    </div>
    <button type="button" onClick={openSearch} style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Open web search and copy terms ↗</button>
    <article aria-label="Synthetic Research and Opportunities Groq test" style={{ marginTop: 18, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq research extraction test</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>Synthetic excerpts only. This test does not search the web. Do not enter private or identifying information. Every source, opportunity, and deadline remains unverified until a human checks a real primary source; this action may incur provider charges.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginTop: 10 }}>
        <label style={labelStyle}>Synthetic source title<input maxLength={500} value={synthetic.title} onChange={(e) => setSynthetic({ ...synthetic, title: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Synthetic deadline<input maxLength={80} value={synthetic.deadline} onChange={(e) => setSynthetic({ ...synthetic, deadline: e.target.value })} style={fieldStyle} placeholder="Synthetic date or leave blank" /></label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Synthetic target profile<textarea maxLength={1200} value={synthetic.targetProfile} onChange={(e) => setSynthetic({ ...synthetic, targetProfile: e.target.value })} style={{ ...fieldStyle, minHeight: 55 }} /></label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Synthetic source excerpt<textarea maxLength={3000} value={synthetic.excerpt} onChange={(e) => setSynthetic({ ...synthetic, excerpt: e.target.value })} style={{ ...fieldStyle, minHeight: 80 }} /></label>
      </div>
      <button type="button" disabled={!operationalReady || aiBusy} onClick={runSyntheticResearch} style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800, cursor: operationalReady ? 'pointer' : 'not-allowed' }}>{aiBusy ? 'Preparing research draft…' : 'Extract synthetic opportunity draft with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational execution is disabled until the agent is status live, active, and human-review-gated. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {aiDraft && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}><b>Synthetic output · All entries unverified · Human review required</b><p>Estimated Groq cost: ${Number(aiDraft.estimated_cost_usd || 0).toFixed(6)}. Usage log persisted: {aiDraft.usage_event_persisted ? 'yes' : 'no; check AI Governance before further runs'}.</p><p>Source references: {aiDraft.output.sources.join(', ')}</p><b>Potential opportunity drafts</b>{aiDraft.output.opportunities.length ? <ul>{aiDraft.output.opportunities.map((item: any, index: number) => <li key={`${item.source_url}-${index}`}><strong>{item.title}</strong>: {item.summary} — deadline {item.deadline || 'not supplied'} — {item.verification_status}</li>)}</ul> : <p>No opportunity extracted from the synthetic excerpt.</p>}<p>Do not treat these as current or real opportunities. Recheck eligibility and dates on primary sources.</p><button type="button" onClick={downloadResearchDraft} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>Download synthetic review draft</button>{' '}<button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent review'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</div>}
    </article>
    <h3 style={{ margin: '20px 0 8px' }}>2. Add a manually reviewed opportunity</h3>
    <form onSubmit={addOpportunity}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
      <label style={labelStyle}>Opportunity title *<input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={fieldStyle} /></label>
      <label style={labelStyle}>Type<input value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} style={fieldStyle} placeholder="Grant, fellowship, job…" /></label>
      <label style={labelStyle}>Organization<input value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} style={fieldStyle} /></label>
      <label style={labelStyle}>Geography<input value={draft.geography} onChange={(e) => setDraft({ ...draft, geography: e.target.value })} style={fieldStyle} /></label>
      <label style={labelStyle}>Deadline<input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} style={fieldStyle} /></label>
      <label style={labelStyle}>Primary source URL *<input required type="url" value={draft.sourceUrl} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} style={fieldStyle} placeholder="https://…" /></label>
      <label style={labelStyle}>Source review<select value={draft.sourceReview} onChange={(e) => setDraft({ ...draft, sourceReview: e.target.value })} style={fieldStyle}><option>Not reviewed</option><option>Source checked</option></select></label>
      <label style={labelStyle}>Deadline review<select value={draft.deadlineReview} onChange={(e) => setDraft({ ...draft, deadlineReview: e.target.value })} style={fieldStyle}><option>Not reviewed</option><option>Deadline checked</option></select></label>
      <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Review notes<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={{ ...fieldStyle, minHeight: 70 }} placeholder="Eligibility, date checked, and relevant source details." /></label>
    </div><button type="submit" style={{ marginTop: 10, border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Add opportunity</button></form>
    <h3 style={{ margin: '22px 0 8px' }}>3. Research report</h3><p style={{ fontSize: 13, color: '#527085' }}>{report.summary}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>{[['Total opportunities', report.totalOpportunities], ['Sources checked', report.sourceChecked], ['Deadlines checked', report.deadlinesChecked], ['Deadlines unverified', report.deadlinesUnverified], ['No deadline listed', report.noDeadlineListed], ['Duplicate source URLs', report.duplicateSourceUrls]].map(([label, value]) => <div key={String(label)} style={{ padding: 12, border: '1px solid #d8e6f1', borderRadius: 10 }}><div style={{ fontSize: 11, color: '#607487' }}>{label}</div><strong style={{ fontSize: 20 }}>{value}</strong></div>)}</div>
    <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse' }}><thead><tr>{columns.map((column) => <th key={column.key} style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #dbe6ef', fontSize: 12 }}>{column.label}</th>)}<th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #dbe6ef', fontSize: 12 }}>Action</th></tr></thead><tbody>{opportunities.map((item) => <tr key={item.id}>{columns.map((column) => <td key={column.key} style={{ padding: 8, borderBottom: '1px solid #edf2f6', fontSize: 12 }}>{column.key === 'sourceUrl' ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open source</a> : item[column.key as keyof Opportunity]}</td>)}<td style={{ padding: 8, borderBottom: '1px solid #edf2f6' }}><button type="button" onClick={() => setOpportunities((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.title}`} style={{ cursor: 'pointer' }}>Remove</button></td></tr>)}</tbody></table>{!opportunities.length && <p style={{ padding: 12, color: '#607487' }}>No opportunities added. Search manually and record only sources you reviewed.</p>}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}><button type="button" disabled={!opportunities.length} onClick={() => exportCsv('careerdev-opportunity-list.csv', opportunities, columns)} style={{ border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: opportunities.length ? 'pointer' : 'not-allowed', opacity: opportunities.length ? 1 : .55 }}>Export opportunity list CSV</button><button type="button" onClick={() => exportCsv('careerdev-opportunity-report.csv', [report], reportColumns)} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Export report CSV</button></div>
    <p style={{ marginBottom: 0, fontSize: 11, color: '#607487' }}>CSV files open in Excel and other spreadsheet tools. This agent remains in testing; verify eligibility, source, and deadline before decisions or distribution.</p>
  </section>;
}
