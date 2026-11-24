'use client';

import { useState } from 'react';
import { createExecutiveReview, executiveReviewToMarkdown } from '../../lib/admin/ceo-operations-workspace.mjs';

const fieldStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };

export default function CEOOperationsWorkspace({ onMessage }: { onMessage: (message: string) => void }) {
  const [input, setInput] = useState({ period: '', target: '', completed: '', qualityScore: '' });
  const [review, setReview] = useState<any>(null);
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
  return <section style={{ marginTop: 18, background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>CEO Operations workspace</h2>
    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#527085' }}>Preview the existing <code>executive_performance_review</code> workflow using aggregate test values. Do not enter names or individual staff data.</p>
    <div role="note" style={{ padding: 12, borderRadius: 10, background: '#fff8e8', border: '1px solid #f0d18b', fontSize: 12, lineHeight: 1.6, color: '#624a20' }}><strong>Admin-only testing preview.</strong> This deterministic summary does not fetch source metrics, score individuals, call AI, or save a report. Review the underlying evidence and decisions with a human.</div>
    <form onSubmit={generate} style={{ marginTop: 14 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
      <label style={labelStyle}>Reporting period *<input required value={input.period} onChange={(e) => update('period', e.target.value)} style={fieldStyle} placeholder="Synthetic test period" /></label>
      <label style={labelStyle}>Aggregate target *<input required type="number" min="1" step="1" value={input.target} onChange={(e) => update('target', e.target.value)} style={fieldStyle} /></label>
      <label style={labelStyle}>Aggregate completed outcomes *<input required type="number" min="0" step="1" value={input.completed} onChange={(e) => update('completed', e.target.value)} style={fieldStyle} /></label>
      <label style={labelStyle}>Aggregate quality score (%) *<input required type="number" min="0" max="100" step="1" value={input.qualityScore} onChange={(e) => update('qualityScore', e.target.value)} style={fieldStyle} /></label>
    </div><button type="submit" style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Create aggregate review preview</button></form>
    {review && <article aria-label="Executive review preview" style={{ marginTop: 18, padding: 16, border: '1px solid #c8d9e8', borderRadius: 12, background: '#f8fcff' }}><strong>Executive review — {review.period}</strong><p>Delivery: {review.completed}/{review.target} ({review.completionRate}%). Quality: {review.qualityScore}%.</p><p><b>Risks:</b> {review.risks.join(' ')}</p><p><b>Suggested actions:</b> {review.actions.join(' ')}</p><p>{review.evidenceBoundary}</p><p><b>Human review required:</b> Yes. Testing preview only.</p><button type="button" onClick={download} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Download Markdown preview</button></article>}
  </section>;
}
