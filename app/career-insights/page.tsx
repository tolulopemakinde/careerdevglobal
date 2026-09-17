import Link from "next/link";
import styles from "./career-insights.module.css";

const insights = [
  {
    icon: "◎",
    title: "Building a Career With Intention",
    description:
      "Practical guidance for understanding your strengths, clarifying direction and turning career goals into meaningful next steps.",
  },
  {
    icon: "↗",
    title: "Skills for a Changing Workforce",
    description:
      "Explore transferable skills, digital capabilities and continuous learning that can support career resilience and mobility.",
  },
  {
    icon: "▣",
    title: "From Education to Employment",
    description:
      "Explore the transition from education and training into meaningful work, including career exploration and employer engagement.",
  },
  {
    icon: "◇",
    title: "Leadership and Professional Growth",
    description:
      "Ideas for developing leadership capacity, professional confidence, workplace effectiveness and long-term career growth.",
  },
  {
    icon: "◌",
    title: "Global Career Mobility",
    description:
      "Considerations for professionals and graduates exploring international opportunities and changing labour markets.",
  },
  {
    icon: "✦",
    title: "Responsible Career Intelligence",
    description:
      "Learn how evidence, human expertise and responsible AI can support better-informed career exploration and decisions.",
  },
];

export default function CareerInsightsPage() {
  return (
    <main className="site-page career-insights-page">
      <section className="site-page-hero career-insights-hero">
        <div className="career-insights-hero-inner">
          <p className="eyebrow">CareerDev Global · Career Insights</p>
          <h1>Ideas that help you move your career forward.</h1>
          <p className="hero-copy">
            Practical perspectives on career development, employability, leadership,
            education-to-employment transitions and global talent mobility.
          </p>
          <div className="career-insights-tags" aria-label="Career Insights topics">
            <span>Career Development</span>
            <span>Employability</span>
            <span>Leadership</span>
            <span>Global Mobility</span>
          </div>
        </div>
      </section>

      <section className="site-page-section career-insights-content" aria-labelledby="insights-heading">
        <div className="site-page-section-heading career-insights-heading">
          <p className="eyebrow">Explore</p>
          <h2 id="insights-heading">Insights for every stage of your career journey</h2>
          <p>
            Use these topics to reflect, explore opportunities and plan your next
            career steps. CareerDev Global provides information to support your
            decisions; it does not make career decisions for you.
          </p>
        </div>

        <div className="site-page-card-grid career-insights-grid">
          {insights.map((insight) => (
            <article className="site-page-card career-insight-card" key={insight.title}>
              <div className="career-insight-icon" aria-hidden="true">{insight.icon}</div>
              <div>
                <h3>{insight.title}</h3>
                <p>{insight.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="site-page-section site-page-cta career-insights-cta">
        <div>
          <p className="eyebrow">Ready for your next step?</p>
          <h2>Turn insight into action.</h2>
          <p>
            Explore Career Intelligence for structured career exploration and planning,
            or connect with a coach for human-guided support.
          </p>
        </div>
        <div className="site-page-actions career-insights-actions">
          <Link href="/career-intelligence" className="site-page-button career-intelligence-action">
            Explore Career Intelligence
          </Link>
          <Link href="/coach-matching" className={`${styles.coachAction} career-coach-action`}>
            <span className={styles.icon} aria-hidden="true">♙</span>
            Find a Coach
            <span className={styles.arrow} aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
