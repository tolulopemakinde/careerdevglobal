import ProfessionalStandardsCarousel from "./professional-standards-carousel";

const services = [
  ["Career Intelligence", "Discover your strengths, career direction, skills gaps and next opportunities.", "🧭"],
  ["Career Development", "CV, LinkedIn, job-search and career strategy support tailored to your goals.", "📈"],
  ["Leadership Development", "Coaching and development experiences for emerging and established leaders.", "♙"],
  ["Talent Mobility", "Connect talent, employers, institutions and opportunities across borders.", "🌍"],
  ["Workforce Development", "Support organisations with talent, learning and workforce solutions.", "🤝"],
  ["Career Education & Research", "Practical learning, events and evidence that improve education-to-work transitions.", "🎓"],
];

function GlobalOpportunityNetwork() {
  return (
    <div className="global-network" aria-hidden="true">
      <svg className="global-network-svg" viewBox="0 0 640 520" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g className="network-lines" stroke="currentColor" strokeWidth="1.2">
          <path d="M72 128 180 82 284 145 398 82 522 140 574 246 468 322 366 268 284 365 164 314 72 382 108 246 180 82" />
          <path d="M72 128 164 314 284 145 366 268 522 140 468 322 574 246 398 82 366 268 284 365 180 82" />
          <path d="M108 246 284 145 468 322 164 314 522 140" />
          <path d="M72 128 284 365 574 246 398 82 164 314" />
        </g>
        <g className="network-orbits" stroke="currentColor" strokeWidth="1" strokeDasharray="4 9">
          <ellipse cx="320" cy="246" rx="250" ry="168" transform="rotate(-24 320 246)" />
          <ellipse cx="320" cy="246" rx="210" ry="125" transform="rotate(34 320 246)" />
        </g>
        <g className="network-nodes" fill="currentColor">
          <circle cx="72" cy="128" r="5"/><circle cx="180" cy="82" r="6"/><circle cx="284" cy="145" r="7"/>
          <circle cx="398" cy="82" r="5"/><circle cx="522" cy="140" r="7"/><circle cx="574" cy="246" r="5"/>
          <circle cx="468" cy="322" r="6"/><circle cx="366" cy="268" r="8"/><circle cx="284" cy="365" r="5"/>
          <circle cx="164" cy="314" r="7"/><circle cx="72" cy="382" r="4"/><circle cx="108" cy="246" r="6"/>
        </g>
        <circle className="network-pulse" cx="366" cy="268" r="18" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle className="network-pulse network-pulse-delay" cx="284" cy="145" r="15" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    </div>
  );
}

export default function Home() {
  return (
    <main className="homepage-motion">
      <section className="hero" id="top">
        <GlobalOpportunityNetwork />
        <div className="container hero-grid">
          <div className="hero-copy motion-hero-copy">
            <p className="eyebrow">CAREER DEVELOPMENT • LEADERSHIP • TALENT MOBILITY</p>
            <h1>Unleashing Your Potential.</h1>
            <p className="lead">Developing careers, leaders, and talents across borders through human expertise and AI-enabled career intelligence.</p>
            <div className="actions">
              <a className="button primary" href="#services">Explore our services</a>
              <a className="button secondary" href="/coach-matching">Find a coach</a>
            </div>
            <div className="trust-row"><span>Human expertise</span><span>AI-enabled intelligence</span><span>Global opportunity</span></div>
          </div>
          <div className="hero-card motion-hero-card" aria-label="Career Intelligence Profile journey">
            <div className="hero-card-top">CAREER INTELLIGENCE PROFILE™</div>
            <div className="journey">{["Goals", "Skills", "Experience", "Pathways", "Opportunities", "Outcomes"].flatMap((step, index) => index === 0 ? [<span className="journey-step" key={step}>{step}</span>] : [<b className="journey-arrow" aria-hidden="true" key={`${step}-arrow`}>→</b>, <span className="journey-step" key={step}>{step}</span>])}</div>
            <p>One connected intelligence layer for clearer career decisions, stronger applications and measurable progress.</p>
          </div>
        </div>
      </section>
      <ProfessionalStandardsCarousel />
      <section className="section" id="services">
        <div className="container">
          <p className="eyebrow motion-reveal">WHAT WE DO</p>
          <h2 className="motion-reveal">Build a career with clarity, confidence and global opportunity.</h2>
          <div className="grid">{services.map(([title, text, icon], index) => <article className="card motion-reveal" style={{ "--motion-index": index } as React.CSSProperties} key={title}><div className="service-icon" aria-hidden="true">{icon}</div><h3>{title}</h3><p>{text}</p></article>)}</div>
        </div>
      </section>
      <section className="section muted" id="coaching">
        <div className="container split">
          <div className="motion-reveal"><p className="eyebrow">CAREERDEV GLOBAL COACH NETWORK</p><h2>Find the right coach for your journey.</h2><p>Browse approved coaches by specialty, experience, language, client type and availability. Clients remain in control of their final coach choice, supported by intelligent matching.</p><a className="button primary" href="/coach-matching">Find a coach</a></div>
          <div className="panel motion-reveal"><span className="panel-label">MATCHING ENGINE</span><strong>Goal → Need → Specialty → Experience → Preference</strong><p>AI recommends suitable coaches; people make the final decision.</p></div>
        </div>
      </section>
      <section className="section" id="about">
        <div className="container about-grid"><div className="motion-reveal"><p className="eyebrow">OUR APPROACH</p><h2>People first. Intelligence powered.</h2></div><div className="motion-reveal"><p>CareerDev Global combines experienced career and leadership professionals with an AI-enabled infrastructure designed to organise insight, research opportunities and support better decisions.</p><p className="small-note">AI assists with analysis, research and drafting. Human professionals remain responsible for high-impact recommendations and client-facing decisions.</p></div></div>
      </section>
      <section className="cta-section" id="contact"><div className="container cta-inner"><div className="motion-reveal"><p className="eyebrow">START YOUR JOURNEY</p><h2>Ready to unlock your next opportunity?</h2></div><a className="button light motion-reveal" href="mailto:hello@careerdevglobal.com">Talk to CareerDev Global</a></div></section>
    </main>
  );
}
