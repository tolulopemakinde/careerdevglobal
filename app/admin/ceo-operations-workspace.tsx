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
  const [aggregateConfirmed, setAggregateConfirmed] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflight, setPreflight] = useState<{ ready: boolean; checks: Record<string, boolean> } | null>(null);
  const [preflightError, setPreflightError] = useState('');
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [operationalResult, setOperationalResult] = useState<any>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
  function update(key: keyof typeof input, value: string) {
    setInput((current) => ({ ...current, [key]: value }));
    setAggregateConfirmed(false);
  }
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
  async function checkProviderReadiness() {
    setPreflightBusy(true);
    setPreflight(null);
    setPreflightError('');
    try {
      const { data, error } = await supabase.functions.invoke('careerdev-ai-agent-runtime', {
        body: { action: 'check_ceo_operations_readiness' },
      });
      if (error || typeof data?.ready !== 'boolean' || !data?.checks) {
        throw new Error('Could not load provider readiness. Check your Administrator session and try again.');
      }
      setPreflight(data);
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : 'Could not load provider readiness.');
    } finally {
      setPreflightBusy(false);
    }
  }
  async function runOperationalDraft() {
    if (!operationalReady || operationalBusy || !aggregateConfirmed) return;
    const period = input.period.trim();
    if (!/^(?:FY)?20\d{2}(?:[-/ ]?(?:Q[1-4]|H[1-2]|M(?:0[1-9]|1[0-2])))?$/i.test(period)) {
      onMessage('Enter an aggregate reporting period such as 2026-Q1 or FY2026.');
      return;
    }
    const target = Number(input.target), completed = Number(input.completed), qualityScore = Number(input.qualityScore);
    if (!input.completed.trim() || !input.qualityScore.trim() || !Number.isSafeInteger(target) || target < 1 || !Number.isSafeInteger(completed) || completed < 0 || completed > target || !Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 100) {
      onMessage('Enter valid aggregate counts and a quality score from 0 to 100.');
      return;
    }
    setOperationalBusy(true); setOperationalResult(null); setApprovalMessage('');
    const payload = { quality: { delivery_score: qualityScore / 100 }, outcomes: { completed, target }, performance_data: { reporting_period: period } };
    try {
      const result = await runCEOOperationsDraft(supabase, payload);
      setOperationalResult(result);
      onMessage(`CEO Operations draft saved for independent review. Execution ID ${result.executionId}.`);
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
    setApprovalMessage(approvalId === null ? 'Independent review request could not be created. Open AI Governance and inspect the execution.' : 'Independent approval request created. An independent reviewer must verify the source report.');
    setApprovalBusy(false);
    onMessage(approvalId === null ? 'Independent review request could not be created.' : `Independent review request created: ${approvalId}`);
  }
  return <section style={{ marginTop: 18, background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>CEO Operations workspace</h2>
    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#527085' }}>Use an approved aggregate service-delivery report for one reporting period and one organizational scope.</p>
    <div role="note" style={{ padding: 12, borderRadius: 10, background: '#fff8e8', border: '1px solid #f0d18b', fontSize: 12, lineHeight: 1.6, color: '#624a20' }}>Use the number of planned outcomes as the target. Count each planned outcome completed during the period once. Use the approved aggregate quality percentage for the same scope and period. Enter aggregate values only.</div>
    <form onSubmit={generate} style={{ marginTop: 14 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
      <label style={labelStyle}>Reporting period *<input required value={input.period} onChange={(e) => update('period', e.target.value)} style={fieldStyle} placeholder="2026-Q1" /></label>
      <label style={labelStyle}>Planned service-delivery outcomes *<input required type="number" min="1" step="1" value={input.target} onChange={(e) => update('target', e.target.value)} style={fieldStyle} /></label>
      <label style={labelStyle}>Planned outcomes completed *<input required type="number" min="0" step="1" value={input.completed} onChange={(e) => update('completed', e.target.value)} style={fieldStyle} /></label>
      <label style={labelStyle}>Aggregate quality score (%) *<input required type="number" min="0" max="100" step="any" value={input.qualityScore} onChange={(e) => update('qualityScore', e.target.value)} style={fieldStyle} /></label>
    </div><button type="submit" style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Create aggregate review preview</button></form>
    {review && <article aria-label="Executive review preview" style={{ marginTop: 18, padding: 16, border: '1px solid #c8d9e8', borderRadius: 12, background: '#f8fcff' }}><strong>Executive review — {review.period}</strong><p>Delivery: {review.completed}/{review.target} ({review.completionRate}%). Quality: {review.qualityScore}%.</p><p><b>Risks:</b> {review.risks.join(' ')}</p><p><b>Suggested actions:</b> {review.actions.join(' ')}</p><p>{review.evidenceBoundary}</p><p><b>Human review required:</b> Yes. Testing preview only.</p><button type="button" onClick={download} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Download Markdown preview</button></article>}
    <article aria-label="CEO Operations operational run" style={{ marginTop: 18, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq operational draft</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>The runtime calculates completion and flags from these figures. Groq prioritizes follow-up actions. An independent reviewer must verify the source report and approve the draft before finalization.</p>
      <div style={{ margin: '12px 0' }}>
        <button type="button" className="ci-secondary" disabled={preflightBusy} onClick={() => void checkProviderReadiness()}>
          {preflightBusy ? 'Checking…' : 'Check Groq readiness'}
        </button>
        {preflightError && <p role="alert">{preflightError}</p>}
        {preflight && <div role="status">
          <p>{preflight.ready ? 'Runtime configuration checks passed.' : 'Runtime configuration needs attention.'} This check uses no inference or credits.</p>
          <ul>
            <li>Credentials {preflight.checks.credentials_configured ? 'configured' : 'missing'}</li>
            <li>Approved model {preflight.checks.approved_model ? 'selected' : 'required'}</li>
            <li>Input and output rates {preflight.checks.rates_configured ? 'configured' : 'missing or invalid'}</li>
            <li>Provider spend limit {preflight.checks.spend_limit_recorded ? 'recorded as confirmed' : 'needs confirmation'}</li>
          </ul>
        </div>}
      </div>
      {operationalReady && <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        <input type="checkbox" checked={aggregateConfirmed} onChange={(event) => setAggregateConfirmed(event.target.checked)} />
        I confirm these figures come from an approved aggregate report and share the same scope and period.
      </label>}
      <button type="button" disabled={!operationalReady || !aggregateConfirmed || operationalBusy} onClick={runOperationalDraft} style={{ border: 0, borderRadius: 9, padding: '10px 14px', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800, cursor: operationalReady ? 'pointer' : 'not-allowed' }}>{operationalBusy ? 'Running governed draft…' : 'Run CEO Operations draft with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational use is disabled while this agent is not active with human approval required. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {operationalResult && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}>
        <strong>Awaiting human review</strong>
        <p>Execution ID <code>{operationalResult.executionId}</code></p>
        <p>Estimated Groq cost {typeof operationalResult.estimated_cost_usd === 'number' ? `$${operationalResult.estimated_cost_usd.toFixed(6)}` : 'unavailable'}.</p>
        {!operationalResult.usage_event_persisted && <p role="alert">The draft was saved, but the provider usage log could not be confirmed. Check AI Governance before another run.</p>}
        <h3>Aggregate findings</h3>
        <ul>{operationalResult.output.insights.map((item: string) => <li key={item}>{item}</li>)}</ul>
        <h3>Risks to review</h3>
        <ul>{operationalResult.output.risks.map((item: string) => <li key={item}>{item}</li>)}</ul>
        <h3>Prioritized follow-up</h3>
        <ol>{operationalResult.output.actions.map((item: string) => <li key={item}>{item}</li>)}</ol>
        <button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent approval'}</button>
        {approvalMessage && <p role="status">{approvalMessage}</p>}
      </div>}
    </article>
  </section>;
}
