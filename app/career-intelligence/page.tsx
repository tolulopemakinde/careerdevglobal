"use client";

import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ufmhrmzumqkjvaezrmxf.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_8lIUCYbLzqp69RpZmE8ktA_56-doCVl";

const aiSystems = [
  ["Career Discovery AI", "Career goals, skills, gaps and direction", "Testing"],
  ["CV & LinkedIn AI", "ATS positioning and professional branding", "Coming next"],
  ["Research & Opportunities AI", "Jobs, scholarships and global opportunities", "Coming next"],
  ["Lead Generation AI", "Qualified prospects and client discovery", "Coming next"],
  ["Sales & Proposal AI", "Proposals, offers and conversion support", "Coming next"],
  ["Marketing & Content AI", "Content planning and campaign intelligence", "Coming next"],
  ["CEO & Operations AI", "Business intelligence and operational support", "Coming next"],
];

const services = [
  "Professional CV Revamp", "LinkedIn Profile Optimization", "Cover Letter Development", "Career Coaching",
  "Executive Coaching", "Leadership Coaching", "Career Strategy Session", "Career Intelligence Assessment",
  "Professional Branding Package",
];

export default function CareerIntelligencePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [service, setService] = useState(services[0]);
  const [request, setRequest] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(1);
  const [userEmail, setUserEmail] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const question = useMemo(() => {
    if (service.includes("CV")) return "What role, industry, or career direction should the CV target?";
    if (service.includes("LinkedIn")) return "What professional opportunities do you want LinkedIn to attract?";
    if (service.includes("Coaching")) return "What career or leadership outcome do you want to achieve?";
    return "What specific outcome would make this service successful for you?";
  }, [service]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user.email || ""));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserEmail(session?.user.email || ""));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const authenticate = async () => {
    setLoading(true); setMessage("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (authMode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email to confirm your account, then return here to sign in.");
      setAuthMode("signin");
      return;
    }
    setUserEmail(result.data.user?.email || email);
    setMessage("Secure account connection established.");
  };

  const analyzeRequest = async () => {
    setLoading(true); setMessage(""); setAnalysis(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMessage("Please create an account or sign in before starting your Career Intelligence request."); setLoading(false); return; }
      const { data: requestId, error: requestError } = await supabase.rpc("create_client_service_request", {
        p_full_name: fullName || session.user.user_metadata?.full_name || "CareerDev Global Client",
        p_service_name: service,
        p_original_request: request,
        p_objective: request,
      });
      if (requestError) throw requestError;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/careerdev-intake-engine-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY },
        body: JSON.stringify({ request_id: requestId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || body.message || "The Career Intelligence engine could not process the request.");
      setAnalysis(body); setStarted(true); setStep(2); setMessage("Career Intelligence analysis completed. Your next questions are ready.");
    } catch (error: any) {
      setMessage(error?.message || "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <main className="ci-page">
      <section className="ci-hero"><div className="ci-container">
        <div className="ci-kicker">CAREERDEV GLOBAL AI CAREER INTELLIGENCE</div>
        <h1>Your career journey, intelligently organized.</h1>
        <p>Tell us what you need. CareerDev Global structures your request, analyzes your existing career evidence, identifies information gaps, and prepares the right next steps—with a Career Coach remaining in control.</p>
        <div className="ci-hero-actions"><a className="ci-primary" href="#intake">Start My Career Intelligence Profile</a><a className="ci-secondary" href="#systems">Explore the AI Systems</a></div>
      </div></section>

      <section id="intake" className="ci-section"><div className="ci-container">
        <div className="ci-section-heading"><span>01</span><div><h2>Intelligent Client Intake</h2><p>No giant questionnaire. Your service request determines the questions.</p></div></div>
        <div className="ci-grid">
          <div className="ci-card intake-card">
            {!userEmail && <><div className="ci-mini-label">SECURE CLIENT ACCESS</div><h3>{authMode === "signup" ? "Create your CareerDev account" : "Welcome back"}</h3>{authMode === "signup" && <><label>Full name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" /></>}<label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /><button className="ci-primary full" onClick={authenticate} disabled={loading}>{loading ? "Connecting..." : authMode === "signup" ? "Create Secure Account" : "Sign In"}</button><button className="ci-link" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "Already have an account? Sign in" : "New to CareerDev Global? Create an account"}</button></>}
            {userEmail && <div className="ci-authenticated">✓ Signed in securely as <strong>{userEmail}</strong></div>}
            <label>What service do you need?</label><select value={service} onChange={(e) => setService(e.target.value)}>{services.map((item) => <option key={item}>{item}</option>)}</select>
            <label>Tell us what you want to achieve</label><textarea value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Describe your career need, target opportunity, deadline, or challenge..." />
            <div className="ci-upload">📎 <strong>Upload career documents</strong><small>CV, LinkedIn export, essays, job descriptions, certificates, portfolio evidence</small></div>
            <button className="ci-primary full" onClick={analyzeRequest} disabled={loading || !request.trim()}>{loading ? "Career Intelligence is analyzing..." : "Analyze My Request"}</button>
            {message && <div className="ci-message">{message}</div>}
          </div>
          <div className="ci-card"><div className="ci-mini-label">DYNAMIC QUESTION ENGINE</div><h3>{started ? question : "What happens next?"}</h3>{!started ? <ol className="ci-list"><li>Securely create or access your client account</li><li>Understand your service request</li><li>Check information already available</li><li>Analyze uploaded evidence</li><li>Ask only necessary follow-up questions</li><li>Build your Career Intelligence Profile</li></ol> : <div className="ci-question"><p>{question}</p><input placeholder="Your answer..." /><button className="ci-secondary" onClick={() => setStep(Math.min(step + 1, 5))}>Save & Continue</button></div>}{analysis && <div className="ci-result"><strong>AI intake run created</strong><small>{analysis.intake_session_id ? `Session: ${analysis.intake_session_id}` : "Your request has entered the CareerDev workflow."}</small></div>}<div className="ci-progress"><span style={{ width: `${step * 20}%` }} /></div><small>Step {step} of 5 · AI analyzes first; human expertise validates consequential decisions.</small></div>
        </div>
      </div></section>

      <section className="ci-section soft" id="profile"><div className="ci-container"><div className="ci-section-heading"><span>02</span><div><h2>Career Intelligence Profile™</h2><p>One evolving career record that can support multiple CareerDev Global services.</p></div></div><div className="profile-grid">{["Education", "Experience & Achievements", "Skills & Transferable Skills", "Career Goals", "Leadership Experience", "Target Roles & Locations", "Development Gaps", "Applications & Outcomes"].map((x, i) => <div className="profile-item" key={x}><b>{String(i + 1).padStart(2, "0")}</b><span>{x}</span><em>Ready for intelligence</em></div>)}</div></div></section>
      <section className="ci-section" id="workflow"><div className="ci-container"><div className="ci-section-heading"><span>03</span><div><h2>End-to-End Career Delivery</h2><p>The technology follows a controlled service workflow rather than producing disconnected AI outputs.</p></div></div><div className="workflow">{["Client Request", "Service & Objective", "Documents & Evidence", "AI Analysis", "Information Gaps", "Service Strategy", "Human Review", "AI Delivery", "Client Feedback", "Outcome Tracking"].map((x, i) => <div className="workflow-step" key={x}><strong>{i + 1}</strong><span>{x}</span></div>)}</div></div></section>
      <section className="ci-section soft" id="systems"><div className="ci-container"><div className="ci-section-heading"><span>04</span><div><h2>Seven CareerDev Global AI Systems</h2><p>Built around the principle: <strong>AI Processes. Humans Decide.</strong></p></div></div><div className="systems-grid">{aiSystems.map(([name, desc, status]) => <article className="system-card" key={name}><div className="system-icon">✦</div><div><h3>{name}</h3><p>{desc}</p><span className={status === "Testing" ? "status testing" : "status"}>{status}</span></div></article>)}</div></div></section>
      <section className="ci-section"><div className="ci-container"><div className="control-panel"><div><span className="ci-kicker">TRUST & GOVERNANCE</span><h2>Built for professional career services—not blind automation.</h2><p>Evidence provenance, verification, quality gates, human review, model/prompt governance, observability and AI cost controls are built into the platform architecture.</p></div><div className="control-grid"><span>✓ Evidence grounded</span><span>✓ No fabrication</span><span>✓ Human review gates</span><span>✓ AI quality testing</span><span>✓ Usage & cost controls</span><span>✓ Outcome tracking</span></div></div></div></section>
      <footer className="ci-footer"><div className="ci-container"><strong>CareerDev Global</strong><span>Developing careers, leaders, and talents across borders.</span><a href="/">Back to main website</a></div></footer>
    </main>
  );
}
