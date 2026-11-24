'use client';

import { useState } from 'react';
import { careerDiscoveryPreviewToMarkdown, createCareerDiscoveryPreview } from '../../lib/admin/career-discovery-workspace.mjs';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';
import { runCareerDiscoveryDraft } from '../../lib/admin/career-discovery-operational.mjs';

const initial = { education: '', experience: '', skills: '', goal: '', roleTargets: '' };

export default function CareerDiscoveryWorkspace({ onMessage, agentStatus, agentActive, humanApprovalRequired }: { onMessage: (message: string) => void; agentStatus: string; agentActive: boolean; humanApprovalRequired: boolean }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [input, setInput] = useState(initial);
  const [preview, setPreview] = useState<ReturnType<typeof createCareerDiscoveryPreview> | null>(null);
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [operationalResult, setOperationalResult] = useState<any>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
  const fieldStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };
  function buildPreview(event: React.FormEvent) {
    event.preventDefault();
    try {
      setPreview(createCareerDiscoveryPreview(input));
      onMessage('Career Discovery testing preview created locally. No account profile, provider, or database was used.');
    } catch (error: any) {
      setPreview(null);
      onMessage(error?.message || 'Career Discovery preview could not be prepared. Check the synthetic input fields.');
    }
  }
  function downloadPreview() {
    if (!preview) return;
    const blob = new Blob([careerDiscoveryPreviewToMarkdown(preview)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'career-discovery-testing-preview.md';
    link.click();
    URL.revokeObjectURL(url);
    onMessage('Testing preview downloaded. Have a human review it before using any career guidance.');
  }
  async function runGroqDraft() {
    if (!operationalReady || operationalBusy) return;
    try {
      const validated = createCareerDiscoveryPreview(input);
      if (validated.input.skills.length > 20 || validated.targetRoles.length > 10) throw new Error('Use no more than 20 synthetic skills and 10 synthetic target roles.');
    } catch (error: any) {
      onMessage(error?.message || 'Enter valid synthetic profile details before starting a Groq request.');
      return;
    }
    setOperationalBusy(true); setOperationalResult(null); setApprovalMessage('');
    const payload = {
      career_profile: {
        source: 'synthetic', education: input.education.trim(), experience: input.experience.trim(),
        skills: input.skills.split(',').map((item) => item.trim()).filter(Boolean),
      },
      service_request: {
        source: 'synthetic', goal: input.goal.trim(),
        target_roles: input.roleTargets.split(',').map((item) => item.trim()).filter(Boolean),
      },
    };
    try {
      const result = await runCareerDiscoveryDraft(supabase, payload);
      setOperationalResult(result);
      onMessage(`Career Discovery draft is awaiting human review. Estimated provider cost: $${Number(result.estimated_cost_usd || 0).toFixed(6)}.`);
    } catch (error: any) {
      onMessage(error?.message || 'Career Discovery could not produce a governed draft. Check AI Governance before retrying.');
    } finally { setOperationalBusy(false); }
  }
  async function requestIndependentReview() {
    if (!operationalResult?.requestId || !operationalResult?.executionId || approvalBusy) return;
    setApprovalBusy(true); setApprovalMessage('');
    try {
      const { data, error } = await supabase.rpc('request_ai_human_approval', { p_request_id: operationalResult.requestId, p_execution_id: operationalResult.executionId });
      if (error || !data) throw new Error('No approval ID returned');
      setApprovalMessage('Independent review request created. Another authorized user must review it.');
      onMessage('Career Discovery draft queued for independent human approval.');
    } catch {
      setApprovalMessage('Independent review request could not be created. Open AI Governance and inspect the execution.');
      onMessage('Independent Career Discovery review request could not be created.');
    } finally { setApprovalBusy(false); }
  }

  return <section style={{ marginTop: 18, padding: 20, border: '1px solid #b8d6eb', borderRadius: 14, background: '#fff' }}>
    <h3 style={{ marginTop: 0 }}>Career Discovery AI — testing workspace</h3>
    <p style={{ color: '#527085', lineHeight: 1.6 }}>Use synthetic education, experience, skills, goals, and target roles only. The local preview is deterministic and free. A separate Groq action is available only when the registry is operationally enabled; it persists an execution and may incur provider charges.</p>
    <form onSubmit={buildPreview} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      {[['education', 'Education'], ['experience', 'Experience'], ['skills', 'Skills (comma-separated)'], ['goal', 'Career goal or preference'], ['roleTargets', 'Target roles (optional, comma-separated)']].map(([key, label]) => <label key={key} style={labelStyle}>{label}<input value={input[key as keyof typeof input]} onChange={(event) => setInput((current) => ({ ...current, [key]: event.target.value }))} maxLength={500} style={fieldStyle} placeholder="Synthetic test data only" /></label>)}
      <button type="submit" style={{ ...fieldStyle, gridColumn: '1 / -1', cursor: 'pointer', background: '#0b5d9b', color: '#fff', fontWeight: 800 }}>Generate local testing preview</button>
    </form>
    {preview && <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: '#f4f9fd', color: '#36566f' }}>
      <strong>Testing preview · Human review required</strong>
      <p><b>Career direction:</b> {preview.careerDirection}</p>
      <p><b>Profile summary:</b> {preview.profileSummary}</p>
      <p><b>Target roles:</b> {preview.targetRoles.length ? preview.targetRoles.join(', ') : 'Not supplied'}</p>
      <b>Recommendations</b><ul>{preview.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
      <b>Gaps and review limits</b><ul>{preview.gaps.map((item) => <li key={item}>{item}</li>)}<li>{preview.evidenceBoundary}</li></ul>
      <button type="button" onClick={downloadPreview} style={{ ...fieldStyle, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>Download Markdown preview</button>
    </div>}
    <article aria-label="Career Discovery governed draft" style={{ marginTop: 18, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq Career Discovery draft</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>Uses only the synthetic fields above and the existing <code>career_profile_analysis</code> workflow. The saved result remains a draft for human review; it cannot approve or complete itself. A live request may incur Groq charges.</p>
      <button type="button" disabled={!operationalReady || operationalBusy} onClick={runGroqDraft} style={{ border: 0, borderRadius: 9, padding: '10px 14px', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800, cursor: operationalReady ? 'pointer' : 'not-allowed' }}>{operationalBusy ? 'Running governed draft…' : 'Run Career Discovery draft with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational use is disabled until this agent is status live, active, and human-review-gated. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {operationalResult && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}><b>Awaiting human review</b><p>Estimated Groq cost: ${Number(operationalResult.estimated_cost_usd || 0).toFixed(6)}. Usage log persisted: {operationalResult.usage_event_persisted ? 'yes' : 'no; check AI Governance before further runs'}.</p><p><b>Career direction:</b> {operationalResult.output.career_direction}</p><p><b>Target roles:</b> {operationalResult.output.target_roles.join(', ') || 'Not specified'}</p><b>Recommendations</b><ul>{operationalResult.output.recommendations.map((item: string, index: number) => <li key={`recommendation-${index}`}>{item}</li>)}</ul><b>Gaps to review</b><ul>{operationalResult.output.gaps.map((item: string, index: number) => <li key={`gap-${index}`}>{item}</li>)}</ul><p>Do not treat suggestions or inferred fit as verified qualifications. Check the supplied evidence and current role requirements with a qualified reviewer.</p><button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent approval'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</div>}
    </article>
  </section>;
}
