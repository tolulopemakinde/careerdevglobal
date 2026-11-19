"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase-browser";

type CareerProfile = {
  professional_summary?: string | null;
  current_job_title?: string | null;
  current_industry?: string | null;
  career_stage?: string | null;
  target_role?: string | null;
  target_roles?: string[] | null;
  target_industry?: string | null;
  target_industries?: string[] | null;
  target_location?: string | null;
  target_locations?: string[] | null;
  career_interests?: string[] | null;
  interests?: string | null;
  strengths_summary?: string | null;
  development_gaps_summary?: string | null;
  development_gaps?: string[] | null;
  achievements?: string | null;
  certifications?: string | null;
  leadership_experience?: string | null;
  portfolio_evidence?: string | null;
};

type DiscoveryResult = {
  direction: string;
  profileSignals: string[];
  questionsToResolve: string[];
  nextSteps: string[];
};

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #d8e6f1",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 8px 25px rgba(0,60,100,.05)",
};
const label: React.CSSProperties = {
  display: "block",
  fontWeight: 800,
  color: "#23445f",
  marginBottom: 7,
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 13px",
  border: "1px solid #bdcedb",
  borderRadius: 9,
  color: "#09233f",
  font: "inherit",
};

export default function CareerDiscoveryPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [profile, setProfile] = useState<CareerProfile>({});
  const [hasProfile, setHasProfile] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const [exploration, setExploration] = useState("");
  const [constraints, setConstraints] = useState("");
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selectedDirection, setSelectedDirection] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        if (mounted) {
          setAccessMessage("Sign in to use Career Discovery.");
          setLoading(false);
        }
        return;
      }
      if (mounted) setUserEmail(user.email || "");

      const [{ data: person }, { data: accessRows, error: accessError }] = await Promise.all([
        supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle(),
        supabase.rpc("get_my_ai_agent_access", { p_agent_key: "career_discovery_agent" }),
      ]);
      const access = Array.isArray(accessRows) ? accessRows[0] : accessRows;
      if (!person || person.status !== "active" || !["client", "coach"].includes(person.role)) {
        if (mounted) {
          setAccessMessage("Career Discovery is available to active Clients and Coaches.");
          setLoading(false);
        }
        return;
      }
      if (accessError || !access?.allowed) {
        if (mounted) {
          setAccessMessage("Career Discovery is not included in the active AI Agent access for this account.");
          setLoading(false);
        }
        return;
      }

      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (client?.id) {
        if (mounted) setClientId(client.id);
        const [{ data: savedProfile }, { data: intelligenceProfile }] = await Promise.all([
          supabase
            .from("career_profiles")
            .select("professional_summary,current_job_title,current_industry,career_stage,target_role,target_roles,target_industry,target_industries,target_location,target_locations,career_interests,interests,strengths_summary,development_gaps_summary,development_gaps,achievements,certifications,leadership_experience,portfolio_evidence")
            .eq("client_id", client.id)
            .eq("is_current", true)
            .maybeSingle(),
          supabase
            .from("career_intelligence_profiles")
            .select("profile_data")
            .eq("profile_id", user.id)
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const merged = {
          ...(savedProfile || {}),
          ...(intelligenceProfile?.profile_data || {}),
        } as CareerProfile;
        if (mounted) {
          setProfile(merged);
          setHasProfile(Object.values(merged).some((value) =>
            Array.isArray(value) ? value.length > 0 : Boolean(value),
          ));
        }
      }
      if (mounted) setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  function buildDiscovery() {
    setMessage("");
    const direction = exploration.trim() || profile.target_role || profile.target_roles?.[0] || "";
    if (!direction) {
      setMessage("Add a role, field, or career interest to explore. Your saved profile will be used alongside it.");
      return;
    }

    const signals: string[] = [];
    if (profile.current_job_title) signals.push(`Current role on your profile: ${profile.current_job_title}`);
    if (profile.current_industry) signals.push(`Current industry on your profile: ${profile.current_industry}`);
    if (profile.career_stage) signals.push(`Career stage on your profile: ${profile.career_stage}`);
    if (profile.target_roles?.length) signals.push(`Saved target roles: ${profile.target_roles.join(", ")}`);
    else if (profile.target_role) signals.push(`Saved target role: ${profile.target_role}`);
    if (profile.target_industries?.length) signals.push(`Saved target industries: ${profile.target_industries.join(", ")}`);
    else if (profile.target_industry) signals.push(`Saved target industry: ${profile.target_industry}`);
    if (profile.career_interests?.length) signals.push(`Saved interests: ${profile.career_interests.join(", ")}`);
    else if (profile.interests) signals.push(`Saved interests: ${profile.interests}`);
    if (profile.strengths_summary) signals.push(`Strengths to review: ${profile.strengths_summary}`);
    if (profile.achievements) signals.push(`Achievements recorded: ${profile.achievements}`);
    if (profile.leadership_experience) signals.push(`Leadership experience recorded: ${profile.leadership_experience}`);
    if (constraints.trim()) signals.push(`Your stated constraints/preferences: ${constraints.trim()}`);

    const questions: string[] = [];
    if (!profile.professional_summary && !profile.achievements && !profile.leadership_experience) {
      questions.push("Add two or three examples of work, study, volunteering, or community experience that you want considered.");
    }
    if (!(profile.career_interests?.length || profile.interests)) {
      questions.push("Which tasks or problems do you enjoy working on most?");
    }
    if (!(profile.target_locations?.length || profile.target_location)) {
      questions.push("What locations, work arrangements, or mobility limits should shape the search?");
    }
    if (!(profile.development_gaps?.length || profile.development_gaps_summary)) {
      questions.push("What skills or requirements would you like to check against real role descriptions?");
    }

    const nextSteps = [
      `Collect 2–3 current descriptions for ${direction} and compare their repeated responsibilities and requirements with your evidence.`,
      "Choose one small project, volunteer task, or learning activity that lets you test the day-to-day work before making a major change.",
      "Record concrete examples, outcomes, and skills from the test in your Career Intelligence Profile.",
      "Review the direction with a CareerDev Global Coach if it will guide a significant career or education decision.",
    ];
    setResult({ direction, profileSignals: signals, questionsToResolve: questions, nextSteps });
    setSelectedDirection(direction);
  }

  async function saveDirection() {
    if (!clientId || !selectedDirection) {
      setMessage("A client profile is required to save this direction as a career goal. You can still use the discovery notes above.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("career_goals").insert({
      client_id: clientId,
      goal: `Explore career direction: ${selectedDirection}`,
      priority: 1,
    });
    setSaving(false);
    setMessage(error ? "Could not save this direction. Please try again from your Career Intelligence profile." : "Saved as a career goal in your profile.");
  }

  const profileHighlights = [
    profile.professional_summary,
    profile.strengths_summary,
    profile.development_gaps_summary,
  ].filter(Boolean);

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f7fbff,#eef6fb)", color: "#09233f", padding: "28px 16px 70px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <a href="/agents" style={{ color: "#0b5d9b", fontWeight: 800, textDecoration: "none" }}>← AI Agents</a>
        <section style={{ ...card, marginTop: 18, padding: "clamp(22px,5vw,44px)", color: "#fff", border: 0, background: "linear-gradient(120deg,#05264d,#0b5d9b)" }}>
          <div style={{ fontSize: 12, letterSpacing: 1, fontWeight: 900, textTransform: "uppercase", opacity: .85 }}>Career Intelligence · Profile-led discovery</div>
          <h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)", lineHeight: 1.08, margin: "12px 0" }}>Explore a career direction with your saved profile</h1>
          <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.7, color: "rgba(255,255,255,.9)" }}>Career Discovery uses the career information already saved to your account, then asks only for the direction or preference you want to explore. It does not promise job fit or employment outcomes.</p>
        </section>

        {loading ? <section style={{ ...card, marginTop: 18 }}>Loading your Career Intelligence profile…</section> : !userEmail ? (
          <section style={{ ...card, marginTop: 18 }}>
            <h2>Sign in to continue</h2>
            <p>{accessMessage}</p>
            <a href="/account" style={{ display: "inline-block", padding: "11px 15px", borderRadius: 9, background: "#0b5d9b", color: "#fff", fontWeight: 800, textDecoration: "none" }}>Sign in / Create account</a>
          </section>
        ) : accessMessage ? (
          <section style={{ ...card, marginTop: 18 }}><h2>Career Discovery access</h2><p>{accessMessage}</p><a href="/pricing" style={{ color: "#0b5d9b", fontWeight: 800 }}>View plans</a></section>
        ) : (
          <>
            <section style={{ ...card, marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div><h2 style={{ margin: "0 0 4px" }}>Your profile context</h2><small style={{ color: "#607487" }}>{hasProfile ? "Saved information will be reused." : "No saved Career Intelligence profile was found; you can still start with your own details."}</small></div>
                <a href="/career-intelligence" style={{ color: "#0b5d9b", fontWeight: 800 }}>Update profile →</a>
              </div>
              {profileHighlights.length > 0 && <ul style={{ paddingLeft: 20, lineHeight: 1.6, color: "#385970" }}>{profileHighlights.map((item, i) => <li key={i}>{item}</li>)}</ul>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 12 }}>
                <div><strong>Target roles</strong><p style={{ color: "#527085", marginTop: 5 }}>{profile.target_roles?.join(", ") || profile.target_role || "Not saved"}</p></div>
                <div><strong>Industries</strong><p style={{ color: "#527085", marginTop: 5 }}>{profile.target_industries?.join(", ") || profile.target_industry || "Not saved"}</p></div>
                <div><strong>Interests</strong><p style={{ color: "#527085", marginTop: 5 }}>{profile.career_interests?.join(", ") || profile.interests || "Not saved"}</p></div>
              </div>
            </section>

            <section style={{ ...card, marginTop: 18 }}>
              <h2 style={{ marginTop: 0 }}>What would you like to explore?</h2>
              <p style={{ color: "#527085", lineHeight: 1.6 }}>Your saved target role is pre-used if you leave this blank. Add a different role, field, or interest to explore another direction.</p>
              <label style={label} htmlFor="career-direction">Role, field, or interest</label>
              <input id="career-direction" value={exploration} onChange={(event) => setExploration(event.target.value)} placeholder={profile.target_role || profile.target_roles?.[0] || "e.g. project management, public health, data analysis"} style={input} maxLength={160} />
              <label style={{ ...label, marginTop: 14 }} htmlFor="career-constraints">Preferences or constraints (optional)</label>
              <textarea id="career-constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="For example: preferred location, work arrangement, salary range, or responsibilities to avoid" rows={3} style={{ ...input, resize: "vertical" }} maxLength={800} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 15 }}>
                <button type="button" onClick={buildDiscovery} style={{ padding: "12px 17px", border: 0, borderRadius: 9, background: "#0b5d9b", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Build my discovery plan →</button>
                <span style={{ color: "#607487", fontSize: 13 }}>Zero-cost structured guidance · no paid model call</span>
              </div>
              {message && <p role="status" style={{ color: "#385970", fontWeight: 700 }}>{message}</p>}
            </section>

            {result && (
              <section style={{ ...card, marginTop: 18 }}>
                <div style={{ display: "inline-block", padding: "5px 9px", borderRadius: 99, background: "#e9f5ef", color: "#256341", fontWeight: 900, fontSize: 12 }}>Exploration plan · not a job-fit verdict</div>
                <h2 style={{ fontSize: 26 }}>Direction to explore: {result.direction}</h2>
                <label style={label} htmlFor="selected-direction">Save a direction as a career goal</label>
                <input id="selected-direction" value={selectedDirection} onChange={(event) => setSelectedDirection(event.target.value)} style={input} maxLength={160} />
                <h3>Profile evidence and context to consider</h3>
                {result.profileSignals.length ? <ul style={{ paddingLeft: 20, lineHeight: 1.7, color: "#385970" }}>{result.profileSignals.map((signal, i) => <li key={i}>{signal}</li>)}</ul> : <p style={{ color: "#527085" }}>No saved profile signals were available. This plan is based on the direction and preferences you entered.</p>}
                {result.questionsToResolve.length > 0 && <><h3>Information that would improve the exploration</h3><ul style={{ paddingLeft: 20, lineHeight: 1.7, color: "#385970" }}>{result.questionsToResolve.map((question) => <li key={question}>{question}</li>)}</ul></>}
                <h3>Next steps</h3>
                <ol style={{ paddingLeft: 22, lineHeight: 1.7, color: "#385970" }}>{result.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol>
                <button type="button" disabled={saving || !selectedDirection.trim()} onClick={() => void saveDirection()} style={{ padding: "11px 15px", border: 0, borderRadius: 9, background: saving ? "#8297a8" : "#0b5d9b", color: "#fff", fontWeight: 900, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Save direction to my goals"}</button>
                {message && <p role="status" style={{ color: "#385970", fontWeight: 700 }}>{message}</p>}
                <p style={{ marginTop: 18, color: "#718394", fontSize: 13, lineHeight: 1.6 }}>This pilot uses deterministic, profile-grounded guidance to keep usage at $0. It does not search current jobs, verify labour-market demand, or make a career suitability assessment. Review role requirements and significant decisions with a qualified coach.</p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
