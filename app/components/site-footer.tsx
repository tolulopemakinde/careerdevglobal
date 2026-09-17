import Link from "next/link";

const footerGroups = [
  {
    title: "For Clients",
    links: [
      ["Career Intelligence", "/career-intelligence"],
      ["Find a Coach", "/coach-matching"],
      ["Career Services", "/#services"],
      ["How It Works", "/help-center#clients"],
    ],
  },
  {
    title: "For Coaches",
    links: [
      ["Coach With Us", "https://careerdevglobal-nine.vercel.app/coach-registration"],
      ["Coach Agreement", "/coach-agreement"],
      ["Coach Guidance", "/help-center#coaches"],
      ["Professional Standards", "/#professional-standards"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Help Center", "/help-center"],
      ["FAQ", "/faq"],
      ["Career Insights", "/career-insights"],
      ["Contact Us", "mailto:hello@careerdevglobal.com"],
    ],
  },
  {
    title: "Legal & Trust",
    links: [
      ["Privacy Policy", "/privacy-policy"],
      ["Conditions of Use", "/conditions-of-use"],
      ["AI & Professional Standards", "/help-center#ai"],
      ["Accessibility", "/help-center#accessibility"],
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer" aria-labelledby="footer-title">
      <style>{`
        .site-footer nav.site-footer-links,
        .site-footer nav[aria-label] {
          display: grid !important;
          align-items: stretch !important;
          gap: 10px !important;
          font-size: 14px !important;
        }
        .site-footer nav.site-footer-links a,
        .site-footer nav[aria-label] a {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          color: #add2df !important;
          text-decoration: none !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          transform: none !important;
        }
        .site-footer nav.site-footer-links a::before,
        .site-footer nav[aria-label] a::before {
          content: none !important;
          display: none !important;
        }
        @media (max-width: 700px) {
          .site-footer nav.site-footer-links,
          .site-footer nav[aria-label] {
            display: grid !important;
            gap: 11px !important;
          }
          .site-footer nav.site-footer-links a,
          .site-footer nav[aria-label] a {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            color: #d7edf5 !important;
            font-size: 15px !important;
            line-height: 1.5 !important;
            padding: 3px 0 !important;
          }
        }
      `}</style>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <div className="footer-brand-mark" aria-hidden="true">CD</div>
          <div>
            <h2 id="footer-title">CareerDev Global</h2>
            <p>Unleashing Your Potential</p>
          </div>
        </div>
        <p className="site-footer-intro">
          Career development, coaching, leadership development and global talent mobility — powered by human expertise and responsible AI-enabled career intelligence.
        </p>

        <div className="site-footer-grid">
          {footerGroups.map((group) => (
            <div className="site-footer-group" key={group.title}>
              <h3>{group.title}</h3>
              <nav className="site-footer-links" aria-label={group.title}>
                {group.links.map(([label, href]) =>
                  href.startsWith("mailto:") ? (
                    <a key={label} href={href}>{label}</a>
                  ) : href.startsWith("http") ? (
                    <a key={label} href={href}>{label}</a>
                  ) : (
                    <Link key={label} href={href}>{label}</Link>
                  )
                )}
              </nav>
            </div>
          ))}
        </div>

        <div className="site-footer-bottom">
          <p>© {new Date().getFullYear()} CareerDev Global. All rights reserved.</p>
          <p><strong>Disclaimer:</strong> Practice informed by relevant professional competency and ethical frameworks. Framework alignment does not by itself imply membership, accreditation, certification, endorsement or formal affiliation.</p>
        </div>
      </div>
    </footer>
  );
}
