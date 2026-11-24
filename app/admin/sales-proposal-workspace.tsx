'use client';

import { useState } from 'react';
import { createProposalPreview, proposalPreviewToMarkdown } from '../../lib/admin/sales-proposal-workspace.mjs';

const fieldStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };

export default function SalesProposalWorkspace({ onMessage }: { onMessage: (message: string) => void }) {
  const [input, setInput] = useState({ organization: '', service: '', needs: '', objectives: '', deliverables: '', timeline: '', priceStatus: 'Not confirmed', priceDetails: '', assumptions: '' });
  const [proposal, setProposal] = useState<any>(null);
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
    {proposal && <article aria-label="Proposal preview" style={{ marginTop: 18, padding: 16, border: '1px solid #c8d9e8', borderRadius: 12, background: '#f8fcff' }}><strong>{proposal.service} — proposal preview</strong><p><b>Prepared for:</b> {proposal.organization}</p><p><b>Needs:</b> {proposal.needs}</p><p><b>Objectives:</b> {proposal.objectives.length ? proposal.objectives.join(' · ') : 'To be confirmed during discovery.'}</p><p><b>Deliverables:</b> {proposal.deliverables.length ? proposal.deliverables.join(' · ') : 'To be confirmed during discovery.'}</p><p><b>Timeline:</b> {proposal.timeline}</p><p><b>Pricing:</b> {proposal.pricing}</p><p><b>Exclusions:</b> {proposal.exclusions.join(' ')}</p><p><b>Next steps:</b> {proposal.nextSteps.join(' ')}</p><p><b>Human review:</b> Required. <b>Sent:</b> No. <b>Saved:</b> No.</p><button type="button" onClick={download} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Download Markdown preview</button></article>}
  </section>;
}
