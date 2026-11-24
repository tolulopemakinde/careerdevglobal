'use client';

import { useMemo, useState } from 'react';
import { buildLinkedInSearchTerms, LINKEDIN_HOME_URL, createLeadReport, LEAD_STATUS_OPTIONS, toSpreadsheetCsv } from '../../lib/admin/lead-generation-workspace.mjs';

type Lead = { id: string; name: string; title: string; company: string; linkedinUrl: string; status: string; contactPermission: string; notes: string };
const blankLead = (): Lead => ({ id: '', name: '', title: '', company: '', linkedinUrl: '', status: 'Needs review', contactPermission: 'Unknown', notes: '' });
const columns = [
  { key: 'name', label: 'Name' }, { key: 'title', label: 'Job title' }, { key: 'company', label: 'Company' },
  { key: 'linkedinUrl', label: 'LinkedIn profile URL' }, { key: 'status', label: 'Human fit review' },
  { key: 'contactPermission', label: 'Contact permission' }, { key: 'notes', label: 'Review notes' },
];

export default function LeadGenerationWorkspace({ onMessage }: { onMessage: (message: string) => void }) {
  const [criteria, setCriteria] = useState({ keywords: '', jobTitles: '', company: '', location: '' });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [draft, setDraft] = useState<Lead>(blankLead());
  const report = useMemo(() => createLeadReport(leads, criteria), [leads, criteria]);
  const setField = (key: keyof typeof criteria, value: string) => setCriteria((current) => ({ ...current, [key]: value }));
  const fieldStyle = { width: '100%', padding: '10px 11px', border: '1px solid #c8d9e8', borderRadius: 8, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 as const, color: '#36566f' };
  async function openSearch() {
    try {
      const terms = buildLinkedInSearchTerms(criteria);
      window.open(LINKEDIN_HOME_URL, '_blank', 'noopener,noreferrer');
      await navigator.clipboard.writeText(terms);
      onMessage('LinkedIn opened and search terms copied. Paste them into LinkedIn search and review results manually.');
    } catch (error: any) { onMessage(error?.message || 'LinkedIn could not be opened or the search terms could not be copied. You can copy the criteria manually.'); }
  }
  function addLead(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) { onMessage('Enter the lead name from your manual review before adding the record.'); return; }
    if (draft.linkedinUrl.trim() && !/^https:\/\/(www\.)?linkedin\.com\//i.test(draft.linkedinUrl.trim())) { onMessage('Enter a LinkedIn profile URL beginning with https://www.linkedin.com/.'); return; }
    setLeads((current) => [...current, { ...draft, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: draft.name.trim(), linkedinUrl: draft.linkedinUrl.trim() }]);
    setDraft(blankLead());
    onMessage('Lead added to this browser session for human review. It has not been saved to the database or contacted.');
  }
  function downloadCsv(name: string, rows: Record<string, any>[], csvColumns: typeof columns) {
    const blob = new Blob([toSpreadsheetCsv(rows, csvColumns)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    URL.revokeObjectURL(url);
  }
  const reportColumns = Object.keys(report).map((key) => ({ key, label: key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase()) }));
  return <section style={{ marginTop: 18, background: '#fff', border: '1px solid #d8e6f1', borderRadius: 16, padding: 20 }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Lead Generation workspace</h2>
    <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#527085' }}>Create a Staff-led LinkedIn search, record selected leads, review fit, and export a report and lead list. Search and lead data stay in this browser session until you export them.</p>
    <div role="note" style={{ padding: 12, borderRadius: 10, background: '#fff8e8', border: '1px solid #f0d18b', fontSize: 12, lineHeight: 1.6, color: '#624a20' }}><strong>Manual search and review required.</strong> This workspace opens LinkedIn’s homepage and copies your search terms for you to paste into LinkedIn. It does not deep-link to search results, scrape profiles, automate LinkedIn, call LinkedIn APIs, send messages, or persist lead data. Follow LinkedIn terms and applicable privacy/marketing rules. Confirm consent or another lawful basis before outreach.</div>
    <h3 style={{ marginBottom: 8 }}>1. Search criteria</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
      {([['keywords', 'Keywords'], ['jobTitles', 'Job titles'], ['company', 'Company'], ['location', 'Location']] as const).map(([key, label]) => <label key={key} style={labelStyle}>{label}<input value={criteria[key]} onChange={(event) => setField(key, event.target.value)} style={fieldStyle} placeholder={label === 'Keywords' ? 'e.g. HR director, workforce development' : `Optional ${label.toLowerCase()}`} /></label>)}
    </div>
    <button type="button" onClick={openSearch} style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Open LinkedIn and copy search terms ↗</button>
    <h3 style={{ margin: '20px 0 8px' }}>2. Add a lead you reviewed</h3>
    <form onSubmit={addLead}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        <label style={labelStyle}>Name *<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={fieldStyle} required /></label>
        <label style={labelStyle}>Job title<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Company<input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>LinkedIn profile URL<input value={draft.linkedinUrl} onChange={(e) => setDraft({ ...draft, linkedinUrl: e.target.value })} style={fieldStyle} placeholder="https://www.linkedin.com/in/…" /></label>
        <label style={labelStyle}>Human fit review<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} style={fieldStyle}>{LEAD_STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label style={labelStyle}>Contact permission<select value={draft.contactPermission} onChange={(e) => setDraft({ ...draft, contactPermission: e.target.value })} style={fieldStyle}><option>Unknown</option><option>Consent confirmed</option><option>Do not contact</option></select></label>
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Review notes<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} style={{ ...fieldStyle, minHeight: 70 }} placeholder="Record only relevant, appropriately obtained business context." /></label>
      </div>
      <button type="submit" style={{ marginTop: 10, border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Add to lead list</button>
    </form>
    <h3 style={{ margin: '22px 0 8px' }}>3. Lead report</h3>
    <p style={{ fontSize: 13, color: '#527085' }}>{report.summary}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>{[['Total leads', report.totalLeads], ['Potential fits', report.potentialFits], ['Needs review', report.needsReview], ['Not a fit', report.notAFit], ['Consent confirmed', report.consentConfirmed], ['Permission unknown', report.permissionUnknown], ['Duplicate profile URLs', report.duplicateProfileUrls]].map(([label, value]) => <div key={String(label)} style={{ padding: 12, border: '1px solid #d8e6f1', borderRadius: 10 }}><div style={{ fontSize: 11, color: '#607487' }}>{label}</div><strong style={{ fontSize: 20 }}>{value}</strong></div>)}</div>
    <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}><thead><tr>{columns.map((column) => <th key={column.key} style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #dbe6ef', fontSize: 12 }}>{column.label}</th>)}<th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #dbe6ef', fontSize: 12 }}>Action</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}>{columns.map((column) => <td key={column.key} style={{ padding: 8, borderBottom: '1px solid #edf2f6', fontSize: 12 }}>{column.key === 'linkedinUrl' && lead.linkedinUrl ? <a href={lead.linkedinUrl} target="_blank" rel="noreferrer">Open profile</a> : lead[column.key as keyof Lead]}</td>)}<td style={{ padding: 8, borderBottom: '1px solid #edf2f6' }}><button type="button" onClick={() => setLeads((current) => current.filter((item) => item.id !== lead.id))} aria-label={`Remove ${lead.name}`} style={{ cursor: 'pointer' }}>Remove</button></td></tr>)}</tbody></table>{!leads.length && <p style={{ padding: 12, color: '#607487' }}>No leads added. Search LinkedIn manually, then record selected leads here.</p>}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}><button type="button" disabled={!leads.length} onClick={() => downloadCsv('careerdev-lead-list.csv', leads, columns)} style={{ border: 0, borderRadius: 9, padding: '10px 14px', background: '#0b5d9b', color: '#fff', fontWeight: 800, cursor: leads.length ? 'pointer' : 'not-allowed', opacity: leads.length ? 1 : .55 }}>Export lead list CSV</button><button type="button" onClick={() => downloadCsv('careerdev-lead-report.csv', [report], reportColumns)} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#173b59', fontWeight: 800, cursor: 'pointer' }}>Export report CSV</button></div>
    <p style={{ marginBottom: 0, fontSize: 11, color: '#607487' }}>CSV files open in Excel and other spreadsheet tools. Data is not stored after this page session. This Staff/Admin agent remains in testing; every fit and outreach decision requires human review.</p>
  </section>;
}

