'use client';

import { useState } from 'react';
import { createCvLinkedInPreview, cvLinkedInPreviewToMarkdown } from '../../lib/admin/cv-linkedin-workspace.mjs';

const initial = { targetRole: '', summary: '', experience: '', skills: '' };

export default function CvLinkedInWorkspace({ onMessage }: { onMessage: (message: string) => void }) {
  const [input, setInput] = useState(initial);
  const [preview, setPreview] = useState<ReturnType<typeof createCvLinkedInPreview> | null>(null);
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
  return <section style={{ marginTop: 18, padding: 20, border: '1px solid #b8d6eb', borderRadius: 14, background: '#fff' }}>
    <h3 style={{ marginTop: 0 }}>CV & LinkedIn AI — testing workspace</h3>
    <p style={{ color: '#527085', lineHeight: 1.6 }}>Use synthetic source facts only. This local draft formatter does not call Groq, another model, the CV service runtime, or the database. Check all claims against source documents before use.</p>
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
  </section>;
}
