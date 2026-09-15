export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">CAREERDEV GLOBAL</p>
          <h1>Unleashing Your Potential.</h1>
          <p className="lead">
            Developing careers, leaders, and talents across borders through
            human expertise and AI-enabled career intelligence.
          </p>
          <div className="actions">
            <a className="button primary" href="#services">Explore our services</a>
            <a className="button secondary" href="#coaching">Find a coach</a>
          </div>
        </div>
      </section>

      <section className="section" id="services">
        <div className="container">
          <p className="eyebrow">WHAT WE DO</p>
          <h2>Build a career with clarity, confidence and global opportunity.</h2>
          <div className="grid">
            {[
              ["Career Intelligence", "Discover your strengths, career direction, skills gaps and next opportunities."],
              ["Career Development", "CV, LinkedIn, job-search and career strategy support tailored to your goals."],
              ["Leadership Development", "Coaching and development experiences for emerging and established leaders."],
              ["Talent Mobility", "Connect talent, employers, institutions and opportunities across borders."],
              ["Workforce Development", "Support organisations with talent, learning and workforce solutions."],
              ["Career Education & Research", "Practical learning, events and evidence that improve education-to-work transitions."],
            ].map(([title, text]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section muted" id="coaching">
        <div className="container split">
          <div>
            <p className="eyebrow">CAREERDEV GLOBAL COACH NETWORK</p>
            <h2>Find the right coach for your journey.</h2>
            <p>
              Browse approved coaches by specialty, experience, language,
              client type and availability. Our future matching engine will
              recommend suitable coaches while keeping the final choice with
              the client.
            </p>
            <a className="button primary" href="#">Find a coach</a>
          </div>
          <div className="panel">
            <strong>Career Intelligence Profile™</strong>
            <p>Goals → Skills → Experience → Pathways → Coaching → Opportunities → Outcomes</p>
          </div>
        </div>
      </section>
    </main>
  );
}
