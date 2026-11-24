'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';
import { createExecutiveReview, executiveReviewToMarkdown, requestCEOIndependentReview, runCEOOperationsDraft } from '../../lib/admin/ceo-operations-workspace.mjs';

const fieldStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };

export default function CEOOperationsWorkspace({ onMessage, agentStatus, agentActive, humanApprovalRequired }: { onMessage: (message: string) => void; agentStatus: string; agentActive: boolean; humanApprovalRequired: boolean }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [input, setInput] = useState({ period: '', target: '', completed: '', qualityScore: '' });
  const [review, setReview] = useState<any>(null);
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [operationalResult, setOperationalResult] = useState<any>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
  function update(key: keyof typeof input, value: string) { setInput((current) => ({ ...current, [key]: value })); }
  function generate(event: React.FormEvent) {
    event.preventDefault();
    try { setReview(createExecutiveReview(input)); onMessage('Aggregate executive review preview created locally. No source data was fetched or saved.'); }
    catch (error: any) { onMessage(error?.message || 'Review preview could not be prepared.'); }
  }
  function download() {
    if (!review) return;
    const url = URL.createObjectURL(new Blob([executiveReviewToMarkdown(review)], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'careerdev-executive-review-preview.md'; anchor.click(); URL.revokeObjectURL(url);
  }
  async function runOperationalDraft() {
    if (!operationalReady || operationalBusy) return;
    const period = input.period.trim();
    if (!/^(?:FY)?20\d{2}(?:[-/ ]?(?:Q[1-4]|H[1-2]|M(?:0[1-9]|1[0-2])))?$/i.test(period)) {
      onMessage('Enter an aggregate reporting period such as 2026-Q1 or FY2026.');
      return;
    }
    const target = Number(input.target), completed = Number(input.completed), qualityScore = Number(input.qualityScore);
    if (!Number.isInteger(target) || target < 1 || !Number.isInteger(completed) || completed < 0 || completed > target || !Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100) {
      onMessage('Enter valid aggregate counts and a quality score from 0 to 100.');
      return;
    }
    setOperationalBusy(true); setOperationalResult(null); setApprovalMessage('');
    const payload = { quality: { delivery_score: qualityScore / 100 }, outcomes: { completed, target }, performance_data: { reporting_period: period } };
    try {
      const result = await runCEOOperationsDraft(supabase, payload);
      setOperationalResult(result);
      onMessage(`CEO Operations draft is ready for independent human review. Estimated provider cost: $${Number(result.estimated_cost_usd || 0).toFixed(6)}.`);
    } catch (error: any) {
      onMessage(error?.message || 'CEO Operations could not produce a governed draft.');
    } finally {
      setOperationalBusy(false);
    }
  }
  async function requestIndependentReview() {
    if (!operationalResult?.requestId || !operationalResult?.executionId || approvalBusy) return;
    setApprovalBusy(true); setApprovalMessage('');
    let approvalId: unknown = null;
    try { approvalId = await requestCEOIndependentReview(supabase, operationalResult); }
    catch { setApprovalMessage('Independent review request could not be created. Open AI Governance and inspect the execution.'); }
    setApprovalMessage(approvalId === null ? 'Independent review request could not be created. Open AI Governance and inspect the execution.' : 'Independent approval request created. Another authorized Administrator must review it.');
    setApprovalBusy(false);
    onMessage(approvalId === null ? 'Independent review request could not be created.' : `Independent review request created: ${approvalId}`);
  }
  return <section style={{ marginTop: 18, background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>CEO Operations workspace</h2>
    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#527085' }}>Preview the existing <code>executive_performance_review</code> workflow using aggregate test values. Do not enter names or individual staff data.</p>
    <div role="note" style={{ padding: 12, borderRadius: 10, background: '#fff8e8', border: '1px solid #f0d18b', fontSize: 12, lineHeight: 1.6, color: '#624a20' }}><strong>Admin-only testing preview.</strong> This deterministic summary does not fetch source metrics, score individuals, call AI, or save a report. Review the underlying evidence and decisions with a human.</div>
    <form onSubmit={generate} style={{ marginTop: 14 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
      <label style={labelStyle}>Reporting period *<input required value={input.period} onChange={(e) => update('period', e.target.value)} style={fieldStyle} placeholder="2026-Q1" /></label>
      <label style={labelStyle}>Aggregate target *<input required type="number" min="1" step="1" value={input.target} onChange={(e) => update('target', e.target.value)} style={fieldStyle} /></label>
      <label style={labelStyle}>Aggregate completed outcomes *<input required type="number" min="0" step="1" value={input.completed} onChange={(e) => update('completed', e.target.value)} style={fieldStyle} /></label>
      <label style={labelStyle}>Aggregate quality score (%) *<input required type="number" min="0" max="100" step="1" value={input.qualityScore} onChange={(e) => update('qualityScore', e.target.value)} style={fieldStyle} /></label>
    </div><button type="submit" style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Create aggregate review preview</button></form>
    {review && <article aria-label="Executive review preview" style={{ marginTop: 18, padding: 16, border: '1px solid #c8d9e8', borderRadius: 12, background: '#f8fcff' }}><strong>Executive review — {review.period}</strong><p>Delivery: {review.completed}/{review.target} ({review.completionRate}%). Quality: {review.qualityScore}%.</p><p><b>Risks:</b> {review.risks.join(' ')}</p><p><b>Suggested actions:</b> {review.actions.join(' ')}</p><p>{review.evidenceBoundary}</p><p><b>Human review required:</b> Yes. Testing preview only.</p><button type="button" onClick={download} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Download Markdown preview</button></article>}
    <article aria-label="CEO Operations operational run" style={{ marginTop: 18, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq operational draft</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>Uses only the aggregate inputs above. A completed run is persisted for review and cannot be finalized until an independent Administrator approves it. No staff-level evaluation or employment decision is permitted.</p>
      <button type="button" disabled={!operationalReady || operationalBusy} onClick={runOperationalDraft} style={{ border: 0, borderRadius: 9, padding: '10px 14px', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800, cursor: operationalReady ? 'pointer' : 'not-allowed' }}>{operationalBusy ? 'Running governed draft…' : 'Run CEO Operations draft with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational use is disabled while this agent is not active with human approval required. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {operationalResult && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}><b>Awaiting human review</b><p>Estimated Groq cost: ${Number(operationalResult.estimated_cost_usd || 0).toFixed(6)}. Usage log persisted: {operationalResult.usage_event_persisted ? 'yes' : 'no; check AI Governance before further runs'}.</p><pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: 12 }}>{JSON.stringify(operationalResult.output, null, 2)}</pre><button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent approval'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</div>}
    </article>
  </section>;
}
