'use client';

import { useMemo, useState } from 'react';
import { buildLinkedInSearchTerms, LINKEDIN_HOME_URL, createLeadReport, LEAD_STATUS_OPTIONS, toSpreadsheetCsv } from '../../lib/admin/lead-generation-workspace.mjs';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';
import { runLeadGenerationDraft } from '../../lib/admin/lead-generation-operational.mjs';

type Lead = { id: string; name: string; title: string; company: string; linkedinUrl: string; status: string; contactPermission: string; notes: string };
const blankLead = (): Lead => ({ id: '', name: '', title: '', company: '', linkedinUrl: '', status: 'Needs review', contactPermission: 'Unknown', notes: '' });
const columns = [
  { key: 'name', label: 'Name' }, { key: 'title', label: 'Job title' }, { key: 'company', label: 'Company' },
  { key: 'linkedinUrl', label: 'LinkedIn profile URL' }, { key: 'status', label: 'Human fit review' },
  { key: 'contactPermission', label: 'Contact permission' }, { key: 'notes', label: 'Review notes' },
];

export default function LeadGenerationWorkspace({ onMessage, agentStatus, agentActive, humanApprovalRequired }: { onMessage: (message: string) => void; agentStatus: string; agentActive: boolean; humanApprovalRequired: boolean }) {
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [criteria, setCriteria] = useState({ keywords: '', jobTitles: '', company: '', location: '' });
  const [syntheticInput, setSyntheticInput] = useState({ roleTitle: '', organizationType: '', needs: '', serviceName: '', serviceDescription: '', consentStatus: 'unknown' });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [draft, setDraft] = useState<Lead>(blankLead());
  const [operationalBusy, setOperationalBusy] = useState(false);
  const [operationalResult, setOperationalResult] = useState<any>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const operationalReady = agentStatus === 'live' && agentActive && humanApprovalRequired;
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
  async function runGroqQualification() {
    if (!operationalReady || operationalBusy) return;
    const needs = syntheticInput.needs.split(',').map((item) => item.trim()).filter(Boolean);
    if (!syntheticInput.roleTitle.trim() || !syntheticInput.organizationType.trim() || !needs.length || !syntheticInput.serviceName.trim() || !syntheticInput.serviceDescription.trim()) {
      onMessage('Complete every synthetic lead and service field before starting a Groq request.'); return;
    }
    if (needs.length > 10 || needs.some((item) => item.length > 1200)) { onMessage('Use no more than 10 synthetic needs, each 1,200 characters or fewer.'); return; }
    const payload = {
      lead: { source: 'synthetic', role_title: syntheticInput.roleTitle.trim(), organization_type: syntheticInput.organizationType.trim(), needs, consent_status: syntheticInput.consentStatus },
      service_catalog: [{ source: 'synthetic', service_name: syntheticInput.serviceName.trim(), description: syntheticInput.serviceDescription.trim() }],
    };
    setOperationalBusy(true); setOperationalResult(null); setApprovalMessage('');
    try {
      const result = await runLeadGenerationDraft(supabase, payload);
      setOperationalResult(result);
      onMessage(`Synthetic lead qualification draft is awaiting human review. Estimated provider cost: $${Number(result.estimated_cost_usd || 0).toFixed(6)}.`);
    } catch (error: any) {
      onMessage(error?.message || 'Lead Generation could not produce a governed qualification draft.');
    } finally { setOperationalBusy(false); }
  }
  async function requestIndependentReview() {
    if (!operationalResult?.requestId || !operationalResult?.executionId || approvalBusy) return;
    setApprovalBusy(true); setApprovalMessage('');
    try {
      const { data, error } = await supabase.rpc('request_ai_human_approval', { p_request_id: operationalResult.requestId, p_execution_id: operationalResult.executionId });
      if (error || !data) throw new Error('No approval ID returned');
      setApprovalMessage('Independent review request created. Another authorized user must review it.');
      onMessage('Lead qualification draft queued for independent human approval.');
    } catch {
      setApprovalMessage('Independent review request could not be created. Open AI Governance and inspect the execution.');
      onMessage('Independent Lead Generation review request could not be created.');
    } finally { setApprovalBusy(false); }
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
    <article aria-label="Synthetic lead qualification test" style={{ marginTop: 18, padding: 16, border: '1px solid #d8e6f1', borderRadius: 12, background: '#f8fcff' }}>
      <strong>Groq lead qualification test</strong>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: '#527085' }}>Synthetic-only model test. Do not enter a real person’s name, LinkedIn profile, contact details, or private notes. This action does not search LinkedIn or contact leads; the output is a draft for human review and may incur provider charges.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginTop: 10 }}>
        <label style={labelStyle}>Synthetic role title<input maxLength={500} value={syntheticInput.roleTitle} onChange={(e) => setSyntheticInput({ ...syntheticInput, roleTitle: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Synthetic organization type<input maxLength={500} value={syntheticInput.organizationType} onChange={(e) => setSyntheticInput({ ...syntheticInput, organizationType: e.target.value })} style={fieldStyle} placeholder="e.g. nonprofit" /></label>
        <label style={labelStyle}>Synthetic needs (comma-separated)<input maxLength={1500} value={syntheticInput.needs} onChange={(e) => setSyntheticInput({ ...syntheticInput, needs: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Synthetic service<input maxLength={500} value={syntheticInput.serviceName} onChange={(e) => setSyntheticInput({ ...syntheticInput, serviceName: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Service description<input maxLength={1200} value={syntheticInput.serviceDescription} onChange={(e) => setSyntheticInput({ ...syntheticInput, serviceDescription: e.target.value })} style={fieldStyle} /></label>
        <label style={labelStyle}>Synthetic contact permission<select value={syntheticInput.consentStatus} onChange={(e) => setSyntheticInput({ ...syntheticInput, consentStatus: e.target.value })} style={fieldStyle}><option value="unknown">Unknown</option><option value="consent_confirmed">Consent confirmed</option><option value="do_not_contact">Do not contact</option></select></label>
      </div>
      <button type="button" disabled={!operationalReady || operationalBusy} onClick={runGroqQualification} style={{ marginTop: 10, border: 0, borderRadius: 9, padding: '10px 14px', background: operationalReady ? '#0b5d9b' : '#8da6ba', color: '#fff', fontWeight: 800, cursor: operationalReady ? 'pointer' : 'not-allowed' }}>{operationalBusy ? 'Running qualification…' : 'Qualify synthetic lead with Groq'}</button>
      {!operationalReady && <p role="note" style={{ fontSize: 12, color: '#7a5b23' }}>Operational use is disabled until this agent is status live, active, and human-review-gated. Current state: {agentStatus}, operational access {agentActive ? 'enabled' : 'disabled'}, review gate {humanApprovalRequired ? 'on' : 'off'}.</p>}
      {operationalResult && <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#fff', border: '1px solid #c8d9e8' }}><b>Awaiting human review</b><p>Estimated Groq cost: ${Number(operationalResult.estimated_cost_usd || 0).toFixed(6)}. Usage log persisted: {operationalResult.usage_event_persisted ? 'yes' : 'no; check AI Governance before further runs'}.</p><p><b>Service fit:</b> {operationalResult.output.service_fit}</p><p><b>Qualification:</b> {operationalResult.output.qualification.status}</p><b>Evidence supplied</b><ul>{operationalResult.output.qualification.evidence.map((item: string, index: number) => <li key={`evidence-${index}`}>{item}</li>)}</ul><b>Missing or unverified</b><ul>{operationalResult.output.qualification.missing.map((item: string, index: number) => <li key={`missing-${index}`}>{item}</li>)}</ul><p><b>Suggested next step:</b> {operationalResult.output.next_action}</p><p>Do not contact anyone from this result. Confirm identity, business need, lawful basis, and permission with a human before outreach.</p><button type="button" disabled={approvalBusy} onClick={requestIndependentReview} style={{ border: '1px solid #c8d9e8', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#173b59', fontWeight: 700 }}>{approvalBusy ? 'Requesting review…' : 'Request independent approval'}</button>{approvalMessage && <p role="status">{approvalMessage}</p>}</div>}
    </article>
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

