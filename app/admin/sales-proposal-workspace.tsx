'use client';

import { useState } from 'react';
import { createProposalPreview, proposalPreviewToMarkdown } from '../../lib/admin/sales-proposal-workspace.mjs';
import { runSalesProposalDraft, salesProposalDraftToMarkdown } from '../../lib/admin/sales-proposal-operational.mjs';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

const fieldStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };

export default function SalesProposalWorkspace({ onMessage, agentStatus, agentActive, humanApprovalRequired }: { onMessage: (message: string) => void; agentStatus: string; agentActive: boolean; humanApprovalRequired: boolean }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [input, setInput] = useState({ organization: '', service: '', needs: '', objectives: '', deliverables: '', timeline: '', priceStatus: 'Not confirmed', priceDetails: '', assumptions: '' });
  const [synthetic, setSynthetic] = useState({ organizationType: '', decisionRole: '', serviceName: '', serviceDescription: '', needsSummary: '', objectives: '', deliverables: '', timeline: '' });
  const [proposal, setProposal] = useState<any>(null);
  const [aiDraft, setAiDraft] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
  function update(key: keyof typeof input, value: string) { setInput((current) => ({ ...current, [key]: value })); }
  function generate(event: React.FormEvent) {
    event.preventDefault();
    try {
      setProposal(createProposalPreview(input));
      onMessage('Local proposal preview generated. It is not saved, sent, or model-generated; authorized human review is required.');
    } catch (error: any) { onMessage(error?.message || 'Proposal preview could not be prepared.'); }
  }
  function download() {
    if (!proposal) return;
    const blob = new Blob([proposalPreviewToMarkdown(proposal)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'careerdev-proposal-preview.md'; anchor.click();
    URL.revokeObjectURL(url);
  }
  async function generateGroqDraft() {
    if (!operationalReady || aiBusy) return;
    const values = Object.fromEntries(Object.entries(synthetic).map(([key, value]) => [key, value.trim()])) as typeof synthetic;
    if (!values.organizationType || !values.decisionRole || !values.serviceName || !values.serviceDescription || !values.needsSummary || !values.timeline) {
      onMessage('Complete all required synthetic proposal fields before starting Groq.'); return;
    }
    const asList = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (values.objectives.length > 1200 || values.deliverables.length > 1200 || asList(values.objectives).length > 10 || asList(values.deliverables).length > 10) {
      onMessage('Use at most 10 synthetic objectives and deliverables, with 1,200 characters maximum in each field.'); return;
    }
    const payload = {
      lead: { source: 'synthetic', organization_type: values.organizationType, decision_role: values.decisionRole },
      needs: { source: 'synthetic', summary: values.needsSummary, objectives: asList(values.objectives), deliverables: asList(values.deliverables), timeline: values.timeline },
      service: { source: 'synthetic', service_name: values.serviceName, description: values.serviceDescription },
    };
    setAiBusy(true); setAiDraft(null); setApprovalMessage('');
    try {
      const result = await runSalesProposalDraft(supabase, payload);
      setAiDraft(result);
      onMessage(`Non-binding proposal draft is awaiting independent review. Estimated provider cost: $${Number(result.estimated_cost_usd || 0).toFixed(6)}.`);
    } catch (error: any) { onMessage(error?.message || 'Sales Proposal could not produce a governed draft.'); }
    finally { setAiBusy(false); }
  }
  async function requestIndependentReview() {
    if (!aiDraft?.requestId || !aiDraft?.executionId || approvalBusy) return;
    setApprovalBusy(true); setApprovalMessage('');
    try {
      const { data, error } = await supabase.rpc('request_ai_human_approval', { p_request_id: aiDraft.requestId, p_execution_id: aiDraft.executionId });
      if (error || !data) throw new Error('No approval ID returned');
      setApprovalMessage('Independent review request created. Another authorized user must review it.');
      onMessage('Sales Proposal draft queued for independent human review.');
    } catch {
      setApprovalMessage('Independent review request could not be created. Open AI Governance and inspect the execution.');
      onMessage('Independent Sales Proposal review request could not be created.');
    } finally { setApprovalBusy(false); }
  }
  function downloadGroqDraft() {
    if (!aiDraft) return;
    const url = URL.createObjectURL(new Blob([salesProposalDraftToMarkdown(aiDraft)], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sales-proposal-nonbinding-review-draft.md'; anchor.click(); URL.revokeObjectURL(url);
  }
  return <section style={{ marginTop: 18, background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Sales Proposal workspace</h2>
    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#527085' }}>Prepare a local proposal preview from Staff-supplied scope details. This is a template check for the existing <code>proposal_generation</code> workflow; it does not call an AI provider or persist proposal data.</p>
    <div role="note" style={{ padding: 12, borderRadius: 10, background: '#fff8e8', border: '1px solid #f0d18b', fontSize: 12, lineHeight: 1.6, color: '#624a20' }}><strong>Testing only.</strong> Use synthetic or non-sensitive details. Price and terms require authorized human confirmation. The workspace cannot send a proposal, approve pricing, promise outcomes, or write to the database.</div>
    <form onSubmit={generate} style={{ marginTop: 14 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
      <label style={labelStyle}>Organization or synthetic client name *<input required value={input.organization} onChange={(e) => update('organization', e.target.value)} style={fieldStyle} /></label>
      <label style={labelStyle}>Service *<input required value={input.service} onChange={(e) => update('service', e.target.value)} style={fieldStyle} placeholder="Career or executive coaching" /></label>
      <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Needs summary *<textarea required value={input.needs} onChange={(e) => update('needs', e.target.value)} style={{ ...fieldStyle, minHeight: 70 }} /></label>
      <label style={labelStyle}>Objectives (one per line)<textarea value={input.objectives} onChange={(e) => update('objectives', e.target.value)} style={{ ...fieldStyle, minHeight: 80 }} /></label>
      <label style={labelStyle}>Deliverables (one per line)<textarea value={input.deliverables} onChange={(e) => update('deliverables', e.target.value)} style={{ ...fieldStyle, minHeight: 80 }} /></label>
      <label style={labelStyle}>Timeline<input value={input.timeline} onChange={(e) => update('timeline', e.target.value)} style={fieldStyle} placeholder="To be agreed after discovery" /></label>
      <label style={labelStyle}>Pricing status<select value={input.priceStatus} onChange={(e) => update('priceStatus', e.target.value)} style={fieldStyle}><option>Not confirmed</option><option>Confirmed</option></select></label>
      <label style={labelStyle}>Price details (used only when confirmed)<input value={input.priceDetails} onChange={(e) => update('priceDetails', e.target.value)} style={fieldStyle} disabled={input.priceStatus !== 'Confirmed'} /></label>
      <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Assumptions (one per line)<textarea value={input.assumptions} onChange={(e) => update('assumptions', e.target.value)} style={{ ...fieldStyle, minHeight: 70 }} /></label>
    </div><button type="submit" style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Create local proposal preview</button></form>
    <article aria-label="Synthetic Sales Proposal Groq test" style={{ marginTop: 18, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq non-binding proposal draft test</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>Synthetic input only. Do not include real client names, confidential needs, prices, or legal terms. Pricing remains pending human confirmation. The AI draft cannot be saved to the proposal system, approved, or sent; the request may incur provider charges.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginTop: 10 }}>
        <label style={labelStyle}>Synthetic organization type<input maxLength={400} value={synthetic.organizationType} onChange={(e) => setSynthetic({ ...synthetic, organizationType: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Synthetic decision role<input maxLength={400} value={synthetic.decisionRole} onChange={(e) => setSynthetic({ ...synthetic, decisionRole: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Synthetic service<input maxLength={400} value={synthetic.serviceName} onChange={(e) => setSynthetic({ ...synthetic, serviceName: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Synthetic timeline<input maxLength={400} value={synthetic.timeline} onChange={(e) => setSynthetic({ ...synthetic, timeline: e.target.value })} style={fieldStyle} /></label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Synthetic service description<textarea maxLength={1200} value={synthetic.serviceDescription} onChange={(e) => setSynthetic({ ...synthetic, serviceDescription: e.target.value })} style={{ ...fieldStyle, minHeight: 55 }} /></label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Synthetic needs summary<textarea maxLength={1200} value={synthetic.needsSummary} onChange={(e) => setSynthetic({ ...synthetic, needsSummary: e.target.value })} style={{ ...fieldStyle, minHeight: 65 }} /></label>
        <label style={labelStyle}>Synthetic objectives (one per line)<textarea maxLength={1200} value={synthetic.objectives} onChange={(e) => setSynthetic({ ...synthetic, objectives: e.target.value })} style={{ ...fieldStyle, minHeight: 65 }} /></label>
        <label style={labelStyle}>Synthetic deliverables (one per line)<textarea maxLength={1200} value={synthetic.deliverables} onChange={(e) => setSynthetic({ ...synthetic, deliverables: e.target.value })} style={{ ...fieldStyle, minHeight: 65 }} /></label>
      </div>
      <button type="button" disabled={!operationalReady || aiBusy} onClick={generateGroqDraft} style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800, cursor: operationalReady ? 'pointer' : 'not-allowed' }}>{aiBusy ? 'Preparing proposal draft…' : 'Generate synthetic proposal with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational execution is disabled until the agent is status live, active, and human-review-gated. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {aiDraft && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}><b>Non-binding draft · Awaiting independent human review</b><p>Pricing pending authorized confirmation. Estimated Groq cost: ${Number(aiDraft.estimated_cost_usd || 0).toFixed(6)}. Usage log persisted: {aiDraft.usage_event_persisted ? 'yes' : 'no; check AI Governance before further runs'}.</p><p>{aiDraft.output.proposal}</p><b>Scope</b><p><b>Inclusions:</b> {aiDraft.output.scope.inclusions.join(' · ')}</p><p><b>Exclusions:</b> {aiDraft.output.scope.exclusions.join(' · ')}</p><p><b>Assumptions:</b> {aiDraft.output.scope.assumptions.join(' · ') || 'None stated'}</p><b>Next steps</b><ul>{aiDraft.output.next_steps.map((item: string, index: number) => <li key={`next-${index}`}>{item}</li>)}</ul><p>Verify scope and terms with an authorized reviewer before sharing. No proposal has been saved, approved, or sent.</p><button type="button" onClick={downloadGroqDraft} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>Download non-binding draft</button>{' '}<button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent review'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</div>}
    </article>
    {proposal && <article aria-label="Proposal preview" style={{ marginTop: 18, padding: 16, border: '1px solid #c8d9e8', borderRadius: 12, background: '#f8fcff' }}><strong>{proposal.service} — proposal preview</strong><p><b>Prepared for:</b> {proposal.organization}</p><p><b>Needs:</b> {proposal.needs}</p><p><b>Objectives:</b> {proposal.objectives.length ? proposal.objectives.join(' · ') : 'To be confirmed during discovery.'}</p><p><b>Deliverables:</b> {proposal.deliverables.length ? proposal.deliverables.join(' · ') : 'To be confirmed during discovery.'}</p><p><b>Timeline:</b> {proposal.timeline}</p><p><b>Pricing:</b> {proposal.pricing}</p><p><b>Exclusions:</b> {proposal.exclusions.join(' ')}</p><p><b>Next steps:</b> {proposal.nextSteps.join(' ')}</p><p><b>Human review:</b> Required. <b>Sent:</b> No. <b>Saved:</b> No.</p><button type="button" onClick={download} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Download Markdown preview</button></article>}
  </section>;
}
