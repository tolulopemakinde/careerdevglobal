'use client';

import { useState } from 'react';
import { careerDiscoveryPreviewToMarkdown, createCareerDiscoveryPreview } from '../../lib/admin/career-discovery-workspace.mjs';

const initial = { education: '', experience: '', skills: '', goal: '', roleTargets: '' };

export default function CareerDiscoveryWorkspace({ onMessage }: { onMessage: (message: string) => void }) {
  const [input, setInput] = useState(initial);
  const [preview, setPreview] = useState<ReturnType<typeof createCareerDiscoveryPreview> | null>(null);
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

  return <section style={{ marginTop: 18, padding: 20, border: '1px solid #b8d6eb', borderRadius: 14, background: '#fff' }}>
    <h3 style={{ marginTop: 0 }}>Career Discovery AI — testing workspace</h3>
    <p style={{ color: '#527085', lineHeight: 1.6 }}>Enter synthetic profile details only. This local preview exercises the workflow shape; it does not call Groq, another model, the Career Discovery runtime, or the database.</p>
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
  </section>;
}
