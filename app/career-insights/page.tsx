import Link from "next/link";

const insights = [
  {
    title: "Building a Career With Intention",
    description:
      "Practical guidance for understanding your strengths, clarifying direction and turning career goals into meaningful next steps.",
  },
  {
    title: "Skills for a Changing Workforce",
    description:
      "Explore how transferable skills, digital capabilities and continuous learning can support career resilience and mobility.",
  },
  {
    title: "From Education to Employment",
    description:
      "Insights on navigating the transition from education and training into meaningful work, including career exploration and employer engagement.",
  },
  {
    title: "Leadership and Professional Growth",
    description:
      "Ideas for developing leadership capacity, professional confidence, workplace effectiveness and long-term career growth.",
  },
  {
    title: "Global Career Mobility",
    description:
      "Considerations for professionals and graduates exploring international opportunities, cross-border careers and changing labour markets.",
  },
  {
    title: "Responsible Career Intelligence",
    description:
      "Learn how evidence, human expertise and responsible AI can support better-informed career exploration and decision-making.",
  },
];

export default function CareerInsightsPage() {
  return (
    <main className="site-page">
      <section className="site-page-hero">
        <p className="eyebrow">CareerDev Global</p>
        <h1>Career Insights</h1>
        <p>
          Practical perspectives on career development, employability, leadership,
          education-to-employment transitions and global talent mobility.
        </p>
      </section>

      <section className="site-page-section" aria-labelledby="insights-heading">
        <div className="site-page-section-heading">
          <p className="eyebrow">Explore</p>
          <h2 id="insights-heading">Insights for your career journey</h2>
          <p>
            Use these resources to reflect, explore opportunities and plan your
            next career steps. CareerDev Global provides information to support
            your decisions; it does not make career decisions for you.
          </p>
        </div>

        <div className="site-page-card-grid">
          {insights.map((insight) => (
            <article className="site-page-card" key={insight.title}>
              <h3>{insight.title}</h3>
              <p>{insight.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-page-section site-page-cta">
        <h2>Turn insight into action</h2>
        <p>
          Explore Career Intelligence for structured career exploration and
          planning, or connect with a coach for human-guided support.
        </p>
        <div className="site-page-actions">
          <Link href="/career-intelligence" className="site-page-button">
            Explore Career Intelligence
          </Link>
          <Link href="/coach-matching" className="site-page-button secondary">
            Find a Coach
          </Link>
        </div>
      </section>
    </main>
  );
}
