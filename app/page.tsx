const services = [
  ["Career Intelligence", "Discover your strengths, career direction, skills gaps and next opportunities.", "🧭"],
  ["Career Development", "CV, LinkedIn, job-search and career strategy support tailored to your goals.", "📈"],
  ["Leadership Development", "Coaching and development experiences for emerging and established leaders.", "♙"],
  ["Talent Mobility", "Connect talent, employers, institutions and opportunities across borders.", "🌍"],
  ["Workforce Development", "Support organisations with talent, learning and workforce solutions.", "🤝"],
  ["Career Education & Research", "Practical learning, events and evidence that improve education-to-work transitions.", "🎓"],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <div className="container nav-wrap">
          <a className="brand" href="#top" aria-label="CareerDev Global home">
            <img src="/careerdev-global-logo.jpg" alt="CareerDev Global — Unleashing Your Potential" />
          </a>
          <nav aria-label="Main navigation">
            <a href="#services">Services</a><a href="#coaching">Coaching</a><a href="#about">About</a><a className="nav-cta" href="#contact">Get Started</a>
          </nav>
        </div>
      </header>
      <section className="hero" id="top"><div className="container hero-grid"><div className="hero-copy"><p className="eyebrow">CAREER DEVELOPMENT • LEADERSHIP • TALENT MOBILITY</p><h1>Unleashing Your Potential.</h1><p className="lead">Developing careers, leaders, and talents across borders through human expertise and AI-enabled career intelligence.</p><div className="actions"><a className="button primary" href="#services">Explore our services</a><a className="button secondary" href="#coaching">Find a coach</a></div><div className="trust-row"><span>Human expertise</span><span>AI-enabled intelligence</span><span>Global opportunity</span></div></div><div className="hero-card" aria-label="Career Intelligence Profile journey"><div className="hero-card-top">CAREER INTELLIGENCE PROFILE™</div><div className="journey"><span>Goals</span><b>→</b><span>Skills</span><b>→</b><span>Experience</span><b>→</b><span>Pathways</span><b>→</b><span>Opportunities</span><b>→</b><span>Outcomes</span></div><p>One connected intelligence layer for clearer career decisions, stronger applications and measurable progress.</p></div></div></section>
      <section className="section" id="services"><div className="container"><p className="eyebrow">WHAT WE DO</p><h2>Build a career with clarity, confidence and global opportunity.</h2><div className="grid">{services.map(([title, text, icon]) => <article className="card" key={title}><div className="service-icon" aria-hidden="true">{icon}</div><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
      <section className="section muted" id="coaching"><div className="container split"><div><p className="eyebrow">CAREERDEV GLOBAL COACH NETWORK</p><h2>Find the right coach for your journey.</h2><p>Browse approved coaches by specialty, experience, language, client type and availability. Clients remain in control of their final coach choice, supported by intelligent matching.</p><a className="button primary" href="#contact">Find a coach</a></div><div className="panel"><span className="panel-label">MATCHING ENGINE</span><strong>Goal → Need → Specialty → Experience → Preference</strong><p>AI recommends suitable coaches; people make the final decision.</p></div></div></section>
      <section className="section" id="about"><div className="container about-grid"><div><p className="eyebrow">OUR APPROACH</p><h2>People first. Intelligence powered.</h2></div><div><p>CareerDev Global combines experienced career and leadership professionals with an AI-enabled infrastructure designed to organise insight, research opportunities and support better decisions.</p><p className="small-note">AI assists with analysis, research and drafting. Human professionals remain responsible for high-impact recommendations and client-facing decisions.</p></div></div></section>
      <section className="cta-section" id="contact"><div className="container cta-inner"><div><p className="eyebrow">START YOUR JOURNEY</p><h2>Ready to unlock your next opportunity?</h2></div><a className="button light" href="mailto:hello@careerdevglobal.com">Talk to CareerDev Global</a></div></section>
      <footer className="footer"><div className="container footer-inner"><img className="footer-logo" src="/careerdev-global-logo.jpg" alt="CareerDev Global — Unleashing Your Potential" /><p>© {new Date().getFullYear()} CareerDev Global. Unleashing Your Potential.</p></div></footer>
    </main>
  );
}
