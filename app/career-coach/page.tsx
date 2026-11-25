import "../career-intelligence/styles.css";
import CareerCoachPanel from "../career-intelligence/career-coach-panel";

export default function CareerCoachPage() {
  return (
    <main className="ci-page">
      <nav className="ci-subnav" aria-label="Career Coach navigation">
        <div className="ci-container ci-subnav-inner">
          <a href="/career-intelligence">← Career Intelligence Platform</a>
          <div>
            <a href="/career-intelligence#profile">Your Profile</a>
            <a href="/agents">All AI Agents</a>
          </div>
        </div>
      </nav>
      <header className="ci-hero">
        <div className="ci-container ci-hero-grid">
          <div>
            <div className="ci-kicker">CAREERDEV GLOBAL · GUIDED COACHING</div>
            <h1>Move your career goal forward.</h1>
            <p>Career Coach works with the profile and goals you have saved in Career Intelligence, then helps you choose a focused action and a way to track progress.</p>
            <div className="ci-hero-actions">
              <a className="ci-primary" href="#career-coach">Start a coaching session</a>
              <a className="ci-secondary" href="/career-intelligence#profile">Review your profile</a>
            </div>
          </div>
          <aside className="ci-hero-panel" aria-label="Career Coach session steps">
            <div className="ci-panel-label">YOUR CAREER CONTEXT</div>
            <div className="ci-panel-title">One shared profile. A clear next step.</div>
            <div className="ci-journey"><span>Goal</span><b>→</b><span>Barrier</span><b>→</b><span>Action</span><b>→</b><span>Progress</span></div>
            <div className="ci-panel-metrics"><div><strong>01</strong><small>Outcome</small></div><div><strong>02</strong><small>Action</small></div><div><strong>03</strong><small>Follow-up</small></div></div>
          </aside>
        </div>
      </header>
      <CareerCoachPanel />
      <footer className="ci-footer">
        <div className="ci-container">
          <div><strong>CareerDev Global</strong><span>Developing careers, leaders, and talents across borders.</span></div>
          <div><a href="/career-intelligence">Career Intelligence</a><a href="/account">Account</a><a href="/coach-matching">Find a Coach</a></div>
        </div>
      </footer>
    </main>
  );
}
