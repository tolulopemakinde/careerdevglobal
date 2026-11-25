'use client';

import { useState } from 'react';
import { createCvLinkedInPreview, cvLinkedInPreviewToMarkdown } from '../../lib/admin/cv-linkedin-workspace.mjs';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';
import { runCvLinkedInDraft } from '../../lib/admin/cv-linkedin-operational.mjs';

const initial = { targetRole: '', summary: '', experience: '', skills: '' };

export default function CvLinkedInWorkspace({ onMessage, agentStatus, agentActive, humanApprovalRequired }: { onMessage: (message: string) => void; agentStatus: string; agentActive: boolean; humanApprovalRequired: boolean }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [input, setInput] = useState(initial);
  const [preview, setPreview] = useState<ReturnType<typeof createCvLinkedInPreview> | null>(null);
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [operationalResult, setOperationalResult] = useState<any>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
  const controlStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };
  function prepare(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = createCvLinkedInPreview(input);
      setPreview(result);
      onMessage('CV & LinkedIn testing draft prepared locally from synthetic source facts. No provider, runtime, or database was used.');
    } catch (error: any) {
      setPreview(null);
      onMessage(error?.message || 'CV & LinkedIn testing draft could not be prepared. Check the synthetic source facts.');
    }
  }
  function download() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([cvLinkedInPreviewToMarkdown(preview)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cv-linkedin-testing-preview.md';
    link.click();
    URL.revokeObjectURL(url);
    onMessage('Testing draft downloaded. Verify every claim against source documents before use.');
  }
  async function runGroqDraft() {
    if (!operationalReady || operationalBusy) return;
    let validated: ReturnType<typeof createCvLinkedInPreview>;
    try {
      validated = createCvLinkedInPreview(input);
      if (validated.sourceEvidence.experience.length > 10 || validated.sourceEvidence.skills.length > 20) throw new Error('Use no more than 10 synthetic experience facts and 20 synthetic skills.');
    } catch (error: any) {
      onMessage(error?.message || 'Enter valid synthetic source facts before starting a Groq request.');
      return;
    }
    const payload = {
      blueprint: { source: 'synthetic', target_role: validated.targetRole },
      documents: [{ source: 'synthetic', document_type: 'career_evidence', content: [input.summary.trim(), ...validated.sourceEvidence.experience, ...validated.sourceEvidence.skills].join('\n') }],
      career_profile: { source: 'synthetic', summary: input.summary.trim(), experience: validated.sourceEvidence.experience, skills: validated.sourceEvidence.skills },
      service_request: { source: 'synthetic', deliverables: ['cv', 'linkedin'], target_role: validated.targetRole },
    };
    setOperationalBusy(true); setOperationalResult(null); setApprovalMessage('');
    try {
      const result = await runCvLinkedInDraft(supabase, payload);
      setOperationalResult(result);
      onMessage(`CV & LinkedIn draft is awaiting human review. Estimated provider cost: $${Number(result.estimated_cost_usd || 0).toFixed(6)}.`);
    } catch (error: any) {
      onMessage(error?.message || 'CV & LinkedIn could not produce a governed draft. Check AI Governance before retrying.');
    } finally { setOperationalBusy(false); }
  }
  async function requestIndependentReview() {
    if (!operationalResult?.requestId || !operationalResult?.executionId || approvalBusy) return;
    setApprovalBusy(true); setApprovalMessage('');
    try {
      const { data, error } = await supabase.rpc('request_ai_human_approval', { p_request_id: operationalResult.requestId, p_execution_id: operationalResult.executionId });
      if (error || !data) throw new Error('No approval ID returned');
      setApprovalMessage('Independent review request created. Another authorized user must review it.');
      onMessage('CV & LinkedIn draft queued for independent human approval.');
    } catch {
      setApprovalMessage('Independent review request could not be created. Open AI Governance and inspect the execution.');
      onMessage('Independent CV & LinkedIn review request could not be created.');
    } finally { setApprovalBusy(false); }
  }
  return <section style={{ marginTop: 18, padding: 20, border: '1px solid #b8d6eb', borderRadius: 14, background: '#fff' }}>
    <h3 style={{ marginTop: 0 }}>CV & LinkedIn AI — testing workspace</h3>
    <p style={{ color: '#527085', lineHeight: 1.6 }}>Use synthetic source facts only. The local formatter is deterministic and free. A separate Groq action is available only if the agent is explicitly operationally enabled; it creates a persisted execution and may incur provider charges. Verify every claim against source documents before use.</p>
    <form onSubmit={prepare} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
      <label style={labelStyle}>Target role<input required maxLength={1500} value={input.targetRole} onChange={(e) => setInput({ ...input, targetRole: e.target.value })} style={controlStyle} placeholder="Synthetic target role" /></label>
      <label style={labelStyle}>Career summary<textarea required maxLength={1500} rows={4} value={input.summary} onChange={(e) => setInput({ ...input, summary: e.target.value })} style={controlStyle} placeholder="Supplied synthetic career summary" /></label>
      <label style={labelStyle}>Experience evidence<textarea required maxLength={1500} rows={5} value={input.experience} onChange={(e) => setInput({ ...input, experience: e.target.value })} style={controlStyle} placeholder="One synthetic fact per line" /></label>
      <label style={labelStyle}>Skills<textarea required maxLength={1500} rows={5} value={input.skills} onChange={(e) => setInput({ ...input, skills: e.target.value })} style={controlStyle} placeholder="Comma-separated synthetic skills" /></label>
      <button type="submit" style={{ ...controlStyle, gridColumn: '1 / -1', cursor: 'pointer', background: '#0b5d9b', color: '#fff', fontWeight: 800 }}>Prepare local testing drafts</button>
    </form>
    {preview && <div style={{ display: 'grid', gap: 12, marginTop: 16, color: '#36566f' }}>
      <div style={{ padding: 14, background: '#f4f9fd', borderRadius: 10, whiteSpace: 'pre-wrap' }}><strong>CV draft</strong><p>{preview.cvDraft}</p></div>
      <div style={{ padding: 14, background: '#f4f9fd', borderRadius: 10, whiteSpace: 'pre-wrap' }}><strong>LinkedIn draft</strong><p>{preview.linkedinDraft}</p></div>
      <p>{preview.qualitySummary} {preview.evidenceBoundary} Human review required.</p>
      <button type="button" onClick={download} style={{ ...controlStyle, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>Download Markdown preview</button>
    </div>}
    <article aria-label="CV and LinkedIn governed draft" style={{ marginTop: 18, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq CV & LinkedIn draft</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>Uses only the synthetic source facts above. The runtime requires clearly labeled CV and LinkedIn draft sections and a human-review flag. Nothing is saved as a final document, published, or submitted.</p>
      <button type="button" disabled={!operationalReady || operationalBusy} onClick={runGroqDraft} style={{ border: 0, borderRadius: 9, padding: '10px 14px', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800, cursor: operationalReady ? 'pointer' : 'not-allowed' }}>{operationalBusy ? 'Running governed draft…' : 'Run CV & LinkedIn draft with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational use is disabled until this agent is status live, active, and human-review-gated. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {operationalResult && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}><b>Awaiting human review</b><p>Estimated Groq cost: ${Number(operationalResult.estimated_cost_usd || 0).toFixed(6)}. Usage log persisted: {operationalResult.usage_event_persisted ? 'yes' : 'no; check AI Governance before further runs'}.</p><pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: 12 }}>{operationalResult.output.cv_draft}</pre><p><b>Quality summary:</b> {operationalResult.output.quality_summary}</p><p>Check all claims, dates, titles, achievements, and credentials against source documents. Human approval is required before client-facing use.</p><button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent approval'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</div>}
    </article>
  </section>;
}
