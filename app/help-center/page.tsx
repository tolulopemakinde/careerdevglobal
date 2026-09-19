import Link from "next/link";

export const metadata = {
  title: "Help Center | CareerDev Global",
  description: "Learn how clients and coaches can use CareerDev Global, its features and responsible AI tools.",
};

const helpGroups = [
  {
    id: "getting-started",
    title: "Getting Started",
    items: [
      ["What is CareerDev Global?", "CareerDev Global combines career development, coaching, professional services and AI-enabled Career Intelligence to help people understand their options and take practical next steps."],
      ["Who can use CareerDev Global?", "The platform is designed for clients seeking career development support and for qualified coaches and professionals who provide relevant services. Specific features may have eligibility or availability requirements."],
      ["How do I get started as a client?", "Start with the service or feature that matches your need. Build your career profile gradually, explore Career Intelligence, review available support and use the resources that are relevant to your goals."],
      ["What information should I provide?", "Share information that is relevant to the service you are using, such as career goals, interests, experience, skills and preferences. Keep important details accurate and review AI-generated content before relying on it."],
    ],
  },
  {
    id: "features",
    title: "Platform Features",
    items: [
      ["What is Career Intelligence?", "Career Intelligence is a structured approach to understanding your goals, interests, capabilities, experience and opportunities, then translating that information into practical career options and actions."],
      ["What can Career Intelligence help me do?", "It can support career exploration, direction-setting, skills reflection, opportunity research, goal setting and action planning. It is designed to support—not make—your career decisions."],
      ["What can the CV & LinkedIn service do?", "It can help improve structure, clarity, evidence, relevance, positioning and alignment with a target role or career direction. You should review the final content and confirm that every claim is accurate."],
      ["What is Opportunity Research?", "Opportunity Research helps users investigate roles, programmes, employers and career pathways using evidence-aware workflows. Important requirements, deadlines and eligibility information should always be checked against authoritative sources."],
      ["How do I use the Career Intelligence Platform & AI Agents?", "Start by signing in and opening Career Intelligence. Choose the AI Agent or career task that matches what you need, then provide clear and accurate information about your goals, experience, skills, interests or the opportunity you are exploring. The AI Agent will analyse the information and can prepare a draft, suggest relevant services or next steps, suggest pricing where pricing information is available, and identify information that is missing. Review the result carefully before using it. AI Agents are designed to assist you—not make important career decisions for you."],
      ["What happens after an AI Agent gives me a result?", "Read the result and check that it reflects your situation. If you are using CareerDev Global as a client, you can use the result to understand your options and then proceed to find a suitable coach or professional when you want personalised human guidance. Coaches can review and refine AI-generated drafts before using them with a client."],
      ["Do I need human approval before an AI Agent can complete its task?", "Not for every AI-assisted task. CareerDev Global AI Agents can analyse supplied information, prepare drafts, suggest services or available pricing information, and identify missing information. Human review remains important before high-impact recommendations, professional advice or client-facing decisions are relied upon."],
      ["What information should I give an AI Agent?", "Give the agent information that is relevant to the task, such as your career goal, target role, experience, education, skills, interests, constraints, preferences or the opportunity you are considering. Be accurate, avoid unnecessary sensitive information, and provide missing details when the agent asks for them."],
      ["Where can I find career resources?", "Use the Career Insights, Help Center and FAQ resources for practical guidance. Additional resources may become available as CareerDev Global expands its learning and career-support ecosystem."],
    ],
  },
  {
    id: "clients",
    title: "For Clients",
    items: [
      ["How do I find a coach?", "Use the coach-discovery pathway when available, review the coach's profile and scope, and choose a professional whose expertise and approach fit your needs. Ask questions before starting if you need clarification."],
      ["What should I look for in a coach?", "Consider the coach's relevant experience, training, credentials, areas of practice, approach, availability and the type of support you want. Credentials should be verified through the relevant issuing body where appropriate."],
      ["How should I use AI-generated career information?", "Treat AI outputs as assistance rather than guaranteed facts. Check important information against current, authoritative sources, especially for deadlines, requirements, compensation, immigration, education or regulated professions."],
      ["Does CareerDev Global guarantee a job?", "No. Career outcomes depend on many factors outside the platform's control. CareerDev Global provides tools and support, not a guaranteed employment, admission, promotion or salary outcome."],
      ["What if I need help outside career coaching?", "Career coaching is not a substitute for clinical, legal, medical, financial or other specialist services. Issues outside a professional's competence should be referred to an appropriately qualified specialist."],
    ],
  },
  {
    id: "coaches",
    title: "For Coaches",
    items: [
      ["How do I become a coach on the platform?", "Start with the coach pathway when available. Be prepared to provide accurate professional information, qualifications, areas of practice and other information required for profile review or onboarding."],
      ["What should my coach profile include?", "Present your qualifications, experience, coaching approach, areas of practice, relevant credentials, availability and service scope accurately so clients can make informed choices."],
      ["How should coaches use AI?", "AI may support preparation, organisation, drafting or research. Coaches remain responsible for professional judgment, client confidentiality, accuracy, boundaries and the quality of the service they provide."],
      ["How should coaches manage client information?", "Use only information necessary for the service, protect confidentiality, follow applicable privacy requirements and avoid entering unnecessary sensitive client information into AI tools or other systems."],
      ["What should I do when an issue is outside my competence?", "Recognise the boundary, explain it appropriately and refer or escalate to a suitably qualified professional when the client's needs require specialist intervention."],
    ],
  },
  {
    id: "ai-trust",
    title: "AI, Privacy & Trust",
    items: [
      ["How does CareerDev Global use AI?", "AI can support career exploration, drafting, organisation, research and other workflows. AI is intended to augment human expertise and client decision-making, not replace professional judgment."],
      ["Can AI choose a career for me?", "No. AI can help explore possibilities, identify patterns, organise information and generate questions or options. Your goals, values, context and judgment remain central to the decision."],
      ["What professional standards guide CareerDev Global?", "Relevant practices are informed by frameworks including ICF, IAEVG, NCDA, EMCC Global and NACE, with Mindler ICCC treated as a specialised career-coaching practice reference. Framework alignment does not by itself imply membership, accreditation, certification or endorsement."],
      ["Why is ICF prioritised?", "ICF provides a primary coaching ethics and competency reference for coaching-related workflows. Other frameworks are applied according to the type of service, so career guidance, employability and coaching needs can receive appropriate safeguards."],
      ["How does CareerDev Global protect my information?", "We aim to collect information that is relevant to the service, use reasonable security measures and provide privacy information about how data is used. See the Privacy Policy for the detailed approach and available rights."],
      ["Can I delete or correct my information?", "Privacy rights depend on applicable law and the type of information. Contact hello@careerdevglobal.com with your request and we will direct it to the appropriate process."],
    ],
  },
  {
    id: "accessibility-support",
    title: "Accessibility & Support",
    items: [
      ["Is CareerDev Global designed for mobile devices?", "We aim to provide a responsive experience across phones, tablets and computers, with clear navigation, readable content and accessible interaction patterns."],
      ["What if I encounter an accessibility barrier?", "Tell us what happened, what you were trying to do and the device or browser you were using at hello@careerdevglobal.com so the team can investigate and improve the experience."],
      ["What if I cannot find the answer I need?", "Review the FAQ for common questions or contact CareerDev Global at hello@careerdevglobal.com with enough context for the team to direct you to the appropriate support."],
    ],
  },
];

export default function HelpCenterPage() {
  return (
    <main className="faq-page">
      <section className="faq-hero help-hero">
        <span>CAREERDEV GLOBAL HELP CENTER</span>
        <h1>How can we help?</h1>
        <p>Clear, practical guidance for clients and coaches using CareerDev Global, its features and AI-enabled career intelligence.</p>
        <div className="help-search" role="search" aria-label="Help Center search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Search help topics" placeholder="Search help topics..." />
          <span className="search-hint">Try “coach”, “CV”, or “AI”</span>
        </div>
      </section>

      <div className="faq-layout">
        <aside className="faq-nav" aria-label="Help Center sections">
          {helpGroups.map((group) => <a key={group.id} href={`#${group.id}`}>{group.title}</a>)}
        </aside>

        <div className="faq-list">
          {helpGroups.map((group) => (
            <section id={group.id} className="faq-group" key={group.id}>
              <h2>{group.title}</h2>
              {group.items.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}<span>+</span></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </section>
          ))}

          <div className="faq-cta">
            <h2>Still need help?</h2>
            <p>We are happy to help you find the right information or direct your question to the appropriate support.</p>
            <a href="mailto:hello@careerdevglobal.com">Contact CareerDev Global →</a>
            <Link href="/faq">Browse FAQs →</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
