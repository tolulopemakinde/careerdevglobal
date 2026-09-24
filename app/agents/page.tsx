'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';

type Agent = {
  id: string;
  agent_key: string;
  name: string;
  description: string;
  agent_category: string;
  status: string;
  human_approval_required: boolean;
};

type Subscription = {
  plan_key: string;
  plan_name: string;
  status: string;
  included_agents: string[];
  monthly_credits: number;
};

const groups: Record<string, string> = {
  career_intelligence: 'Career Intelligence',
  service_delivery: 'Career Documents & Services',
  research: 'Research & Opportunities',
  governance: 'Governance & Quality',
};

export default function AgentsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setMessage('');

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
      setMessage('Please sign in to use CareerDev Global AI Agents.');
      setLoading(false);
      return;
    }

    const { data: me, error: profileError } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', user.id)
      .single();

    if (profileError || !me || me.status !== 'active' || !['client', 'coach'].includes(me.role)) {
      setMessage('This AI Agent workspace is available to active Clients and Coaches.');
      setLoading(false);
      return;
    }

    setRole(me.role);

    const { data: agentRows, error: agentsError } = await supabase
      .from('ai_agent_registry')
      .select('id,agent_key,name,description,agent_category,status,human_approval_required')
      .eq('active', true)
      .eq('owner_role', 'client_coach')
      .order('created_at');

    if (agentsError) {
      setMessage(agentsError.message);
      setLoading(false);
      return;
    }

    setAgents((agentRows || []) as Agent[]);

    const { data: sub } = await supabase.rpc('get_my_ai_subscription');
    const row = Array.isArray(sub) ? sub[0] : sub;
    if (row?.plan_key) setSubscription(row as Subscription);

    setLoading(false);
  }

  function startFromCareerIntelligence() {
    window.location.assign('/career-intelligence');
  }

  const grouped = agents.reduce((acc, agent) => {
    (acc[agent.agent_category] ??= []).push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  const included = new Set(subscription?.included_agents || []);

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f7fbff,#eef6fb)', color: '#09233f', padding: '32px 16px 70px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <section style={{ position: 'relative', minHeight: 390, borderRadius: 22, overflow: 'hidden', marginBottom: 28, backgroundImage: "linear-gradient(90deg,rgba(3,24,55,.94) 0%,rgba(5,35,74,.84) 48%,rgba(5,35,74,.68) 100%),url('https://images.unsplash.com/photo-1758876021772-2684360dfc97?auto=format&fit=crop&fm=jpg&q=80&w=2400')", backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <header style={{ position: 'relative', zIndex: 1, minHeight: 390, display: 'flex', justifyContent: 'space-between', gap: 28, alignItems: 'center', flexWrap: 'wrap', padding: '42px clamp(24px,6vw,64px)', color: '#fff' }}>
            <div style={{ maxWidth: 790 }}>
              <a href="/" style={{ color: 'rgba(255,255,255,.9)', fontWeight: 800, textDecoration: 'none' }}>← CareerDev Global</a>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 26, opacity: .86 }}>Career Development • AI & Automation</div>
              <h1 style={{ fontSize: 'clamp(2.2rem,5vw,4rem)', lineHeight: 1.05, margin: '10px 0 12px' }}>CareerDev AI Agents</h1>
              <p style={{ margin: 0, color: 'rgba(255,255,255,.9)', maxWidth: 760, fontSize: 'clamp(1rem,2vw,1.15rem)', lineHeight: 1.65 }}>Sixteen specialized agents working from one shared Career Intelligence Profile to help you develop your career, build your professional brand, discover opportunities, and grow globally.</p>
              <p style={{ fontWeight: 900, margin: '18px 0 0' }}>AI prepares. You review. Coaches validate when needed.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="/pricing" style={{ padding: '11px 15px', borderRadius: 9, background: '#fff', color: '#0b5d9b', fontWeight: 900, textDecoration: 'none' }}>Pricing</a>
              <a href="/career-intelligence" style={{ padding: '11px 15px', border: '1px solid rgba(255,255,255,.45)', borderRadius: 9, background: 'rgba(255,255,255,.1)', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Career Intelligence Profile</a>
            </div>
          </header>
        </section>

        {!role && (
          <section style={{ background: '#fff', padding: 22, borderRadius: 16, border: '1px solid #d8e6f1' }}>
            <strong>{message || 'Sign in to access your AI Agents.'}</strong>
            <p style={{ color: '#607487' }}>Clients and Coaches have access to the specialized CareerDev Global agent workspace.</p>
            <a href="/account" style={{ display: 'inline-block', padding: '10px 14px', borderRadius: 9, background: '#0b5d9b', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>Sign in / Account</a>
          </section>
        )}

        {role && (
          <>
            <section style={{ background: '#fff', padding: 20, borderRadius: 16, border: '1px solid #b9d7ea', marginBottom: 24, boxShadow: '0 8px 25px rgba(0,60,100,.04)' }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 900, color: '#1671b9' }}>Start with Career Intelligence</div>
              <h2 style={{ margin: '6px 0', fontSize: 22 }}>Your AI Agents work through the Career Intelligence Platform.</h2>
              <p style={{ margin: '0 0 12px', color: '#527085', lineHeight: 1.6 }}>AI Agents are not separate standalone tools. Purchased AI Agent access enhances the capacity and functionality of your Career Intelligence Platform. Start there so your career profile, goals, evidence, services and context can guide the AI-assisted work.</p>
              <button onClick={startFromCareerIntelligence} style={{ padding: '11px 16px', border: 0, borderRadius: 9, background: '#0b5d9b', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Open Career Intelligence →</button>
            </section>

            <section style={{ background: '#fff', padding: 18, borderRadius: 16, border: '1px solid #d8e6f1', marginBottom: 24 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 900, color: '#1671b9' }}>Shared intelligence layer</div>
              <h2 style={{ margin: '6px 0' }}>Career Intelligence Profile™</h2>
              <p style={{ margin: 0, color: '#527085' }}>All {agents.length} agents use the same evolving profile context. Each AI capability is designed to support structured career decision-making.</p>
              {subscription ? (
                <p style={{ margin: '10px 0 0', fontWeight: 800 }}>Current plan: {subscription.plan_name} · {subscription.monthly_credits.toLocaleString()} AI credits/month allowance</p>
              ) : (
                <p style={{ margin: '10px 0 0', color: '#8a5b00', fontWeight: 800 }}>No active AI Agent subscription. <a href="/pricing" style={{ color: '#0b5d9b' }}>Choose a plan →</a></p>
              )}
            </section>

            {loading ? <p>Loading agents…</p> : Object.entries(grouped).map(([category, list]) => (
              <section key={category} style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22 }}>{groups[category] || category}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
                  {list.map(agent => {
                    const allowed = included.has(agent.agent_key);
                    return (
                      <article key={agent.id} style={{ background: '#fff', border: '1px solid ' + (allowed ? '#d8e6f1' : '#e3e8ed'), borderRadius: 16, padding: 18, boxShadow: '0 8px 25px rgba(0,60,100,.05)', opacity: allowed ? 1 : .86 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                          <h3 style={{ margin: 0 }}>{agent.name}</h3>
                          <span style={{ fontSize: 11, fontWeight: 900, padding: '4px 7px', borderRadius: 999, background: allowed ? '#eaf6ef' : '#f1f3f5', whiteSpace: 'nowrap' }}>{allowed ? 'Included' : 'Locked'}</span>
                        </div>
                        <p style={{ color: '#527085', lineHeight: 1.55, minHeight: 66 }}>{agent.description}</p>
                        <button onClick={startFromCareerIntelligence} disabled={!allowed} style={{ width: '100%', padding: '11px 14px', border: 0, borderRadius: 9, background: allowed ? '#0b5d9b' : '#dfe6ec', color: allowed ? '#fff' : '#527085', fontWeight: 900, cursor: allowed ? 'pointer' : 'default' }}>{allowed ? 'Start in Career Intelligence →' : 'Upgrade to Access'}</button>
                        {!allowed && <a href="/pricing" style={{ display: 'block', textAlign: 'center', marginTop: 9, color: '#0b5d9b', fontWeight: 800, fontSize: 12 }}>View plans</a>}
                        <small style={{ display: 'block', marginTop: 9, color: '#718394' }}>AI output: decision-support · Coach validation recommended for clients</small>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}

            {message && <section style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #c8d9e8', marginTop: 18 }}>{message}</section>}
          </>
        )}

        <footer style={{ marginTop: 45, paddingTop: 20, borderTop: '1px solid #d8e6f1', fontSize: 12, color: '#718394' }}>
          CareerDev Global AI Agents provide decision support. Clients should consider connecting with a CareerDev Global Coach to validate results and determine appropriate next steps before consequential professional use.
        </footer>
      </div>
    </main>
  );
}
