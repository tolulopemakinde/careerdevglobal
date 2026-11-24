'use client';

import { useState } from 'react';
import { createMarketingContentPreview, marketingContentPreviewToMarkdown } from '../../lib/admin/marketing-content-workspace.mjs';

const initial = { topic: '', audience: '', cta: '', brandGuidance: '' };

export default function MarketingContentWorkspace({ onMessage }: { onMessage: (message: string) => void }) {
  const [input, setInput] = useState(initial);
  const [preview, setPreview] = useState<ReturnType<typeof createMarketingContentPreview> | null>(null);
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
  return <section style={{ marginTop: 18, padding: 20, border: '1px solid #b8d6eb', borderRadius: 14, background: '#fff' }}>
    <h3 style={{ marginTop: 0 }}>Marketing Content AI — testing workspace</h3>
    <p style={{ color: '#527085', lineHeight: 1.6 }}>Use synthetic topics and audience descriptions only. This deterministic template preview does not call Groq, another model, the live content runtime, or the database. It cannot save, publish, or send content.</p>
    <form onSubmit={generate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      <label style={labelStyle}>Topic<input required maxLength={400} value={input.topic} onChange={(e) => setInput({ ...input, topic: e.target.value })} style={inputStyle} placeholder="Synthetic topic" /></label>
      <label style={labelStyle}>Audience<input required maxLength={400} value={input.audience} onChange={(e) => setInput({ ...input, audience: e.target.value })} style={inputStyle} placeholder="Synthetic audience" /></label>
      <label style={labelStyle}>Call to action<input required maxLength={400} value={input.cta} onChange={(e) => setInput({ ...input, cta: e.target.value })} style={inputStyle} placeholder="Non-promissory CTA" /></label>
      <label style={labelStyle}>Brand guidance (optional)<input maxLength={400} value={input.brandGuidance} onChange={(e) => setInput({ ...input, brandGuidance: e.target.value })} style={inputStyle} placeholder="Synthetic brand note" /></label>
      <button type="submit" style={{ ...inputStyle, gridColumn: '1 / -1', cursor: 'pointer', background: '#0b5d9b', color: '#fff', fontWeight: 800 }}>Generate local testing preview</button>
    </form>
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
