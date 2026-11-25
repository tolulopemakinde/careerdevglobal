'use client';

import { useState } from 'react';
import { createMarketingContentPreview, marketingContentPreviewToMarkdown } from '../../lib/admin/marketing-content-workspace.mjs';
import { runMarketingContentDraft, marketingContentDraftToMarkdown } from '../../lib/admin/marketing-content-operational.mjs';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

const initial = { topic: '', audience: '', cta: '', brandGuidance: '' };

export default function MarketingContentWorkspace({ onMessage, agentStatus, agentActive, humanApprovalRequired }: { onMessage: (message: string) => void; agentStatus: string; agentActive: boolean; humanApprovalRequired: boolean }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [input, setInput] = useState(initial);
  const [preview, setPreview] = useState<ReturnType<typeof createMarketingContentPreview> | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
  const inputStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };
  function generate(event: React.FormEvent) {
    event.preventDefault();
    try {
      setPreview(createMarketingContentPreview(input));
      onMessage('Marketing Content testing preview generated locally. It was not saved, published, sent, or sent to an AI provider.');
    } catch (error: any) {
      setPreview(null);
      onMessage(error?.message || 'Marketing Content preview could not be prepared. Check the synthetic inputs.');
    }
  }
  function download() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([marketingContentPreviewToMarkdown(preview)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'marketing-content-testing-preview.md';
    link.click();
    URL.revokeObjectURL(url);
    onMessage('Testing preview downloaded. Have a human review factual claims and brand fit before use.');
  }
  async function generateGroqDraft() {
    if (!operationalReady || busy) return;
    const topic = input.topic.trim();
    const audience = input.audience.trim();
    const cta = input.cta.trim();
    const brandGuidance = [input.brandGuidance.trim(), `Requested call to action: ${cta}`].filter(Boolean).join('\n');
    if (!topic || !audience || !cta) { onMessage('Complete the synthetic topic, audience, and call to action before starting a Groq request.'); return; }
    setBusy(true); setDraft(null); setApprovalMessage('');
    try {
      const result = await runMarketingContentDraft(supabase, { topic, audience, brand_guidance: brandGuidance });
      setDraft(result);
      onMessage(`Marketing Content draft is awaiting independent human review. Estimated provider cost: $${Number(result.estimated_cost_usd || 0).toFixed(6)}.`);
    } catch (error: any) { onMessage(error?.message || 'Marketing Content could not produce a governed draft.'); }
    finally { setBusy(false); }
  }
  async function requestIndependentReview() {
    if (!draft?.requestId || !draft?.executionId || approvalBusy) return;
    setApprovalBusy(true); setApprovalMessage('');
    try {
      const { data, error } = await supabase.rpc('request_ai_human_approval', { p_request_id: draft.requestId, p_execution_id: draft.executionId });
      if (error || !data) throw new Error('No approval ID returned');
      setApprovalMessage('Independent review request created. Another authorized user must review it.');
      onMessage('Marketing Content draft queued for independent human review.');
    } catch {
      setApprovalMessage('Independent review request could not be created. Open AI Governance and inspect the execution.');
      onMessage('Independent Marketing Content review request could not be created.');
    } finally { setApprovalBusy(false); }
  }
  function downloadGroqDraft() {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([marketingContentDraftToMarkdown(draft)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'marketing-content-ai-review-draft.md'; link.click(); URL.revokeObjectURL(url);
  }
  return <section style={{ marginTop: 18, padding: 20, border: '1px solid #b8d6eb', borderRadius: 14, background: '#fff' }}>
    <h3 style={{ marginTop: 0 }}>Marketing Content AI — testing workspace</h3>
    <p style={{ color: '#527085', lineHeight: 1.6 }}>Use synthetic topics and audience descriptions only. The deterministic preview is local and free. The separate Groq action is gated by Staff/Admin authorization and registry readiness; any output remains a draft requiring independent human review. Neither action can publish or send content.</p>
    <form onSubmit={generate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      <label style={labelStyle}>Topic<input required maxLength={400} value={input.topic} onChange={(e) => setInput({ ...input, topic: e.target.value })} style={inputStyle} placeholder="Synthetic topic" /></label>
      <label style={labelStyle}>Audience<input required maxLength={400} value={input.audience} onChange={(e) => setInput({ ...input, audience: e.target.value })} style={inputStyle} placeholder="Synthetic audience" /></label>
      <label style={labelStyle}>Call to action<input required maxLength={400} value={input.cta} onChange={(e) => setInput({ ...input, cta: e.target.value })} style={inputStyle} placeholder="Non-promissory CTA" /></label>
      <label style={labelStyle}>Brand guidance (optional)<input maxLength={400} value={input.brandGuidance} onChange={(e) => setInput({ ...input, brandGuidance: e.target.value })} style={inputStyle} placeholder="Synthetic brand note" /></label>
      <button type="submit" style={{ ...inputStyle, gridColumn: '1 / -1', cursor: 'pointer', background: '#0b5d9b', color: '#fff', fontWeight: 800 }}>Generate local testing preview</button>
    </form>
    <article aria-label="Synthetic Marketing Content Groq test" style={{ marginTop: 16, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq content draft test</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>Synthetic input only. Do not enter client details or confidential campaign information. Drafts are not saved, published, or sent and may incur provider charges.</p>
      <button type="button" disabled={!operationalReady || busy} onClick={generateGroqDraft} style={{ ...inputStyle, cursor: operationalReady ? 'pointer' : 'not-allowed', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800 }}>{busy ? 'Generating draft…' : 'Generate synthetic draft with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational execution is disabled until the agent is status live, active, and human-review-gated. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {draft && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}><b>Awaiting independent human review</b><p>Estimated Groq cost: ${Number(draft.estimated_cost_usd || 0).toFixed(6)}. Usage log persisted: {draft.usage_event_persisted ? 'yes' : 'no; check AI Governance before further runs'}.</p><p><b>Draft:</b> {draft.output.content}</p><p><b>CTA:</b> {draft.output.cta}</p><b>Repurposing</b><ul>{draft.output.repurposing.map((item: any, index: number) => <li key={`${item.channel}-${index}`}>{item.channel}: {item.draft}</li>)}</ul><p>Verify every factual claim and brand detail. Do not publish or send before human approval.</p><button type="button" onClick={downloadGroqDraft} style={{ ...inputStyle, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>Download review draft</button>{' '}<button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ ...inputStyle, marginTop: 8, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent review'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</div>}
    </article>
    {preview && <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: '#f4f9fd', color: '#36566f' }}>
      <strong>Testing preview · Human review required</strong>
      <p><b>Draft:</b> {preview.content}</p>
      <p><b>CTA:</b> {preview.cta}</p>
      <b>Repurposing</b><ul>{preview.repurposing.map((item) => <li key={item.channel}>{item.channel}: {item.draft}</li>)}</ul>
      <p>{preview.qualitySummary} {preview.evidenceBoundary}</p>
      <button type="button" onClick={download} style={{ ...inputStyle, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>Download Markdown preview</button>
    </div>}
  </section>;
}
