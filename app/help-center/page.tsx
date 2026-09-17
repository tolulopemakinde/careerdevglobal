import Link from "next/link";

export const metadata = { title: "Help Center | CareerDev Global", description: "Learn how clients and coaches can use CareerDev Global." };

const clientSteps = [
  ["Create your account", "Start with the information needed to access your chosen CareerDev Global service. Keep your details accurate so recommendations and communications remain useful."],
  ["Build your career profile", "Add your goals, interests, experience, skills and preferences gradually. Share only information that is relevant to the service you want."],
  ["Explore Career Intelligence", "Use guided career exploration, skills and goal prompts, opportunity research and action planning to turn uncertainty into a structured next step."],
  ["Find the right support", "Where coaching is available, review coach information and choose a professional whose services and expertise fit your needs."],
  ["Work on your documents", "Use CV, LinkedIn and career-positioning services to improve clarity, evidence, relevance and alignment with your target direction."],
  ["Track progress", "Return to your goals, actions and career insights so your plan can evolve as your experience and priorities change."],
];
const coachSteps = [
  ["Create your professional profile", "Present your qualifications, experience, coaching approach, areas of practice and relevant professional credentials accurately."],
  ["Define your services", "Make your scope, audience, session format and expectations clear so clients can make informed choices."],
  ["Manage client work", "Use agreed goals, boundaries, confidentiality practices and appropriate records. Keep client information limited to what you need."],
  ["Use AI responsibly", "Treat AI as an assistant for preparation and workflow support, not as a replacement for professional judgment or the coaching relationship."],
  ["Stay within competence", "Refer or escalate matters outside your competence, especially where clinical, legal, safeguarding or other specialist intervention is required."],
];
const features = [
  ["Career Intelligence", "Structured career exploration, direction-setting, skills reflection, opportunity research and action planning."],
  ["Coach Discovery", "A pathway for clients to identify and engage with appropriate coaching support where available."],
  ["Professional Documents", "Career-focused support for CVs, LinkedIn profiles, cover letters and professional positioning."],
  ["Opportunity Research", "Evidence-aware research workflows designed to help users investigate roles, programmes, employers and career pathways."],
  ["Responsible AI", "AI-assisted support with human oversight, uncertainty flags, evidence provenance, privacy safeguards and professional boundaries."],
  ["Resources & Learning", "Guides, insights, FAQs and practical resources that help users make informed career decisions."],
];

export default function HelpCenterPage() {
  return <main className="help-page"><section className="help-hero"><div><span>CAREERDEV GLOBAL HELP CENTER</span><h1>Find your next step with confidence.</h1><p>Everything you need to understand the platform, use its features and get the most from your CareerDev Global experience.</p><div className="help-search" role="search"><span aria-hidden="true">⌕</span><input aria-label="Search help" placeholder="Search help topics..." /><span className="search-hint">Try “coach”, “CV”, or “AI”</span></div></div></section><section className="feature-section"><div className="section-heading"><span>THE PLATFORM</span><h2>What you can do here</h2><p>CareerDev Global brings career development, coaching, professional positioning and career intelligence into one connected experience.</p></div><div className="feature-grid">{features.map(([title, text], i) => <article className="feature-card" key={title}><div className="feature-number">0{i + 1}</div><h3>{title}</h3><p>{text}</p></article>)}</div></section><section id="clients" className="journey-section"><div className="section-heading"><span>FOR CLIENTS</span><h2>Your CareerDev journey</h2><p>Start with a question, build clarity, then turn insight into practical action.</p></div><div className="journey-grid">{clientSteps.map(([title, text], i) => <article key={title}><div className="step-dot">{i + 1}</div><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section><section id="coaches" className="journey-section coach-section"><div className="section-heading"><span>FOR COACHES</span><h2>Build a trusted coaching presence</h2><p>CareerDev Global is designed to support professional coaches while preserving client autonomy, confidentiality and ethical boundaries.</p></div><div className="journey-grid">{coachSteps.map(([title, text], i) => <article key={title}><div className="step-dot">{i + 1}</div><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section><section id="ai" className="trust-section"><div><span>RESPONSIBLE AI</span><h2>AI that supports people — not the other way around.</h2><p>Our AI-enabled workflows are designed around professional standards, evidence provenance, privacy, client autonomy, role boundaries and human oversight. AI outputs can be wrong, so important decisions should always receive appropriate human review.</p></div><div className="trust-points"><strong>ICF-prioritised ethics</strong><strong>Evidence & provenance</strong><strong>Human oversight</strong><strong>Privacy by design</strong></div></section><section id="accessibility" className="accessibility-section"><h2>Accessibility & support</h2><p>We aim to make CareerDev Global clear, keyboard-friendly, responsive and understandable across devices. If you encounter an accessibility barrier, tell us what happened and what you were trying to do at <a href="mailto:hello@careerdevglobal.com">hello@careerdevglobal.com</a>.</p><Link href="/faq">Browse frequently asked questions →</Link></section></main>;
}
