'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../../lib/supabase-browser';

type Row = Record<string, any>;

export default function AIGovernancePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [usagePolicies, setUsagePolicies] = useState<Row[]>([]);
  const [calendly, setCalendly] = useState({ active: 0, oauth: 0 });
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('Loading governance status…');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      window.location.href = '/admin/login';
      return;
    }
    const { data: roleData } = await supabase.rpc('get_my_role');
    if (!roleData || !['admin', 'staff'].includes(roleData.role) || roleData.status !== 'active') {
      setMessage('This governance dashboard requires an active Staff/Admin account.');
      setLoading(false);
      return;
    }
    setRole(roleData.role);
    const [{ data: cert, error: certError }, { data: policies }, { data: cal }] = await Promise.all([
      supabase.from('ai_agent_certification_status').select('*').order('agent_key'),
      supabase.from('ai_usage_policies').select('*').order('name'),
      supabase.rpc('ai_governance_calendly_status')
    ]);
    if (certError) setMessage(certError.message);
    else setMessage('Governance status loaded. No certification gate is being marked passed without evidence.');
    setRows(cert || []);
    setUsagePolicies(policies || []);
    if (cal) setCalendly(cal);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const clientCoach = rows.filter(r =>
    ['career_discovery_agent','career_assessment_agent','career_coach_agent','cv_resume_agent',
     'cover_letter_agent','linkedin_optimization_agent','job_search_intelligence_agent','interview_coach_agent',
     'skills_gaps_agent','learning_development_agent','leadership_coach_agent','talent_mobility_agent',
     'employer_talent_agent','academic_career_transition_agent','career_research_agent','ethics_quality_assurance_agent'].includes(r.agent_key)
  );
  const pass = (v: boolean) => v ? 'PASS' : 'PENDING';
  const allReady = clientCoach.length === 16 && clientCoach.every(r => r.security_verified && r.configuration_verified && r.workflow_verified && r.output_schema_verified && r.human_approval_verified && r.audit_verified && r.quality_suite_verified && r.safety_gate_verified && r.e2e_verified);

  return <main style={{ minHeight:'100vh', background:'linear-gradient(180deg,#f7fbff,#eef6fb)', color:'#09233f', padding:'32px 16px 70px' }}>
    <div style={{ maxWidth:1250, margin:'0 auto' }}>
      <a href="/admin" style={{ color:'#176da9', fontWeight:800, textDecoration:'none' }}>← Platform Administration</a>
      <h1 style={{ fontSize:'clamp(2rem,5vw,3rem)', margin:'12px 0 6px' }}>AI Governance & Certification</h1>
      <p style={{ color:'#527085', maxWidth:900 }}>Evidence dashboard for the 16 Client/Coach AI Agents. Certification is evidence-based; this page never promotes an agent to Live by itself.</p>
      <div style={{ marginTop:18, padding:16, borderRadius:14, border:'1px solid #d8e6f1', background:'#fff' }}>
        <strong>Authenticated role:</strong> {role || '—'} &nbsp;·&nbsp;
        <strong>16-agent release gate:</strong> <span style={{ fontWeight:900 }}>{allReady ? 'ELIGIBLE' : 'BLOCKED'}</span>
        <div style={{ marginTop:8, color:'#607487', fontSize:13 }}>Current certification state: {clientCoach.filter(r=>r.certification_status==='certified').length}/16 certified.</div>
      </div>

      {message && <div style={{ marginTop:14, padding:14, borderRadius:12, border:'1px solid #c8d9e8', background:'#fff' }}>{message}</div>}

      {loading ? <p>Loading…</p> : <>
        <section style={{ marginTop:18, background:'#fff', border:'1px solid #d8e6f1', borderRadius:16, padding:18, overflowX:'auto' }}>
          <h2 style={{ marginTop:0 }}>Certification matrix</h2>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1100 }}>
            <thead><tr>{['Agent','Security','Config','Workflow','Schema','Approval','Audit','Quality','Safety','E2E','Status'].map(h=><th key={h} style={{ textAlign:'left', padding:9, borderBottom:'2px solid #dbe6ef', fontSize:12 }}>{h}</th>)}</tr></thead>
            <tbody>{clientCoach.map(r=><tr key={r.agent_key}>
              <td style={{ padding:9, borderBottom:'1px solid #edf2f6', fontWeight:800 }}>{r.name}</td>
              {[r.security_verified,r.configuration_verified,r.workflow_verified,r.output_schema_verified,r.human_approval_verified,r.audit_verified,r.quality_suite_verified,r.safety_gate_verified,r.e2e_verified].map((v,i)=><td key={i} style={{ padding:9, borderBottom:'1px solid #edf2f6', fontSize:12 }}>{pass(v)}</td>)}
              <td style={{ padding:9, borderBottom:'1px solid #edf2f6', fontWeight:800 }}>{r.certification_status}</td>
            </tr>)}</tbody>
          </table>
        </section>

        <section style={{ marginTop:18, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
          <article style={{ background:'#fff', border:'1px solid #d8e6f1', borderRadius:16, padding:18 }}>
            <h2 style={{ marginTop:0 }}>Quality Suite</h2>
            <div style={{ fontSize:28, fontWeight:900 }}>{clientCoach.filter(r=>r.quality_suite_verified).length}/16</div>
            <p style={{ color:'#607487' }}>No suite result is counted as certification evidence until an authenticated Staff/Admin governed run is executed and persisted.</p>
          </article>
          <article style={{ background:'#fff', border:'1px solid #d8e6f1', borderRadius:16, padding:18 }}>
            <h2 style={{ marginTop:0 }}>Production Safety Gate</h2>
            <div style={{ fontSize:28, fontWeight:900 }}>{clientCoach.filter(r=>r.safety_gate_verified).length}/16</div>
            <p style={{ color:'#607487' }}>The safety gate remains blocked until every certification flag is true.</p>
          </article>
          <article style={{ background:'#fff', border:'1px solid #d8e6f1', borderRadius:16, padding:18 }}>
            <h2 style={{ marginTop:0 }}>Client/Coach E2E</h2>
            <div style={{ fontSize:28, fontWeight:900 }}>{clientCoach.filter(r=>r.e2e_verified).length}/16</div>
            <p style={{ color:'#607487' }}>Requires a legitimate authenticated Client/Coach session; no test identity is fabricated.</p>
          </article>
        </section>

        <section style={{ marginTop:18, background:'#fff', border:'1px solid #d8e6f1', borderRadius:16, padding:18 }}>
          <h2 style={{ marginTop:0 }}>AI Usage / Subscription Governance</h2>
          {usagePolicies.length === 0 ? <p style={{ color:'#607487' }}>No active AI usage policies are configured yet. The usage infrastructure exists, but plan-specific limits must use the approved CareerDev subscription entitlements rather than guessed values.</p> :
          <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr>{['Name','Scope','Workflow','Model','Max Input','Max Output','Max Cost','Human Review','Active'].map(h=><th key={h} style={{ textAlign:'left', padding:8, borderBottom:'2px solid #dbe6ef' }}>{h}</th>)}</tr></thead><tbody>{usagePolicies.map(p=><tr key={p.id}>{['name','service_scope','workflow','model_name','max_input_tokens','max_output_tokens','max_estimated_cost_usd','require_human_review','active'].map(k=><td key={k} style={{ padding:8, borderBottom:'1px solid #edf2f6', fontSize:13 }}>{String(p[k] ?? '—')}</td>)}</tr>)}</tbody></table></div>}
        </section>

        <section style={{ marginTop:18, background:'#fff', border:'1px solid #d8e6f1', borderRadius:16, padding:18 }}>
          <h2 style={{ marginTop:0 }}>Calendly E2E readiness</h2>
          <p style={{ color:'#607487' }}>Active encrypted Calendly connections: <strong>{calendly.active}</strong>. Live OAuth states: <strong>{calendly.oauth}</strong>.</p>
          <p style={{ color:'#607487' }}>A zero connection count means the real Coach OAuth flow still needs an authenticated coach to complete it. The dashboard does not create or simulate a connection.</p>
        </section>

        <section style={{ marginTop:18, padding:18, borderRadius:16, background:'#fff8e8', border:'1px solid #ead9a7' }}>
          <strong>Release rule</strong>
          <p style={{ marginBottom:0, color:'#6d5a35' }}>AI Processes. Humans Decide. No Client/Coach agent should be marked Live until quality-suite evidence, authenticated Client/Coach E2E evidence, and the production safety gate are all genuinely complete.</p>
        </section>
      </>}
    </div>
  </main>;
}
