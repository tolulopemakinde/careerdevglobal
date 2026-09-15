'use client';

import { useMemo, useState } from "react";
import "./styles.css";

type Coach = {
  name: string; role: string; initials: string; score: number; expertise: string[];
  style: "Structured" | "Conversational"; location: string; proof: string;
  reason: string; tags: string[]; tradeoff?: string;
};

const coaches: Coach[] = [
  { name: "Maya Okafor", role: "Product leadership · Career transitions", initials: "MO", score: 94, expertise: ["career transition", "product management", "interview storytelling"], style: "Structured", location: "Lagos · GMT+1", reason: "Best match for translating operations experience into a credible product narrative.", proof: "12 years in product hiring · 4.9/5 from transition clients", tags: ["Goal language match", "Structured practice plan", "Hiring-manager lens"] },
  { name: "Daniel Brooks", role: "Executive communication · Confidence", initials: "DB", score: 87, expertise: ["interview storytelling", "leadership", "confidence"], style: "Conversational", location: "London · GMT", reason: "Strong fit if your priority is sounding clear, confident, and senior in interviews.", proof: "Former VP People · 300+ interview sessions", tags: ["Storytelling strength", "Confidence support", "Conversational style"], tradeoff: "Less product-specific experience" },
  { name: "Priya Shah", role: "Product strategy · First-time PMs", initials: "PS", score: 82, expertise: ["product management", "leadership", "career transition"], style: "Structured", location: "Toronto · EST", reason: "A practical option for building a product toolkit alongside your career story.", proof: "PM leader · Specializes in first-time product managers", tags: ["PM expertise", "Action-oriented", "Timezone trade-off"], tradeoff: "Timezone may require flexibility" }
];

export default function CoachMatching() {
  const [goal, setGoal] = useState("I’m moving from operations into product management and need help telling a stronger career story for interviews.");
  const [mode, setMode] = useState("Any format");
  const [signals, setSignals] = useState(["Career transition", "Product management", "Interview storytelling"]);
  const toggle = (signal: string) => setSignals(current => current.includes(signal) ? current.filter(item => item !== signal) : [...current, signal]);
  const ranked = useMemo(() => {
    const text = (goal + " " + signals.join(" ")).toLowerCase();
    return coaches.map(coach => {
      const semanticBoost = coach.expertise.filter(item => text.includes(item)).length * 2;
      const styleBoost = mode !== "Any format" && coach.style === mode ? 4 : 0;
      return { ...coach, displayScore: Math.min(99, coach.score + semanticBoost + styleBoost) };
    }).sort((a, b) => b.displayScore - a.displayScore);
  }, [goal, mode, signals]);

  return <main className="matching-page">
    <header className="matching-header"><a href="/" className="back-link">← CareerDev Global</a><span className="engine-badge">07B.92 · Explainable recommendation engine</span></header>
    <section className="matching-hero"><p className="eyebrow">AI AGENTS FOR CAREERDEV GLOBAL</p><h1>Find a coach who fits your next move.</h1><p>Describe what you want to achieve. Semantic matching surfaces relevant coaches, while eligibility rules and human choice stay in control.</p></section>
    <section className="matching-grid">
      <aside className="intent-card"><h2>Candidate intent</h2><label htmlFor="goal">What do you want help with?</label><textarea id="goal" value={goal} onChange={event => setGoal(event.target.value)} />
        <label>Signals we detected</label><div className="signal-list">{["Career transition", "Product management", "Interview storytelling", "Leadership", "Confidence"].map(signal => <button key={signal} className={signals.includes(signal) ? "signal active" : "signal"} onClick={() => toggle(signal)}>{signal}</button>)}</div>
        <label htmlFor="mode">Preferred coaching mode</label><select id="mode" value={mode} onChange={event => setMode(event.target.value)}><option>Any format</option><option>Structured</option><option>Conversational</option></select>
        <p className="gate-note"><span>✓</span> Eligibility gate passed · approved, available coaches only</p>
      </aside>
      <div className="results"><div className="results-head"><div><p className="eyebrow">RECOMMENDED COACHES</p><h2>{ranked.length} matches ranked by fit</h2></div><span className="advisory">AI advisory · people decide</span></div>
        {ranked.map((coach, index) => <article className={index === 0 ? "coach-card top" : "coach-card"} key={coach.name}><div className="coach-line"><div className="person"><span className="avatar">{coach.initials}</span><div><h3>{coach.name}</h3><p>{coach.role}</p></div></div><strong className="score">{coach.displayScore}<small>/100</small></strong></div><p className="reason"><b>{index === 0 ? "Top recommendation · " : ""}</b>{coach.reason}</p><div className="tag-row">{coach.tags.map((tag, tagIndex) => <span className={tagIndex === 0 ? "tag good" : "tag"} key={tag}>{tag}</span>)}{coach.tradeoff && <span className="tag tradeoff">{coach.tradeoff}</span>}</div><footer><span>{coach.proof} · {coach.location}</span><button onClick={() => alert("Selection is intentionally human-led. Profile and booking flow would open here.")}>View profile →</button></footer></article>)}
      </div>
    </section>
    <section className="explain"><h2>How the recommendation is formed</h2><p>Client Career Intelligence becomes a semantic profile. Retrieval finds relevant candidates, deterministic eligibility filters the pool, and the combined score produces these reasons.</p><div className="weights"><span><b>45%</b> Goal & expertise fit</span><span><b>30%</b> Coaching style fit</span><span><b>25%</b> Practical constraints</span></div></section>
  </main>;
}
