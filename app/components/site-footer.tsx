import Image from "next/image";
import Link from "next/link";
const footerGroups = [
  { title: "For Clients", links: [["Career Intelligence","/career-intelligence"],["Find a Coach","/coach-matching"],["Career Services","/#services"],["Client Signup","/client/signup"],["How It Works","/help-center#clients"]] },
  { title: "For Coaches", links: [["Coach With Us","/coach-registration"],["Coach Signup","/coach/signup"],["Coach Agreement","/coach-agreement"],["Coach Guidance","/help-center#coaches"],["Professional Standards","/#professional-standards"]] },
  { title: "Resources", links: [["Help Center","/help-center"],["FAQ","/faq"],["Career Insights","/career-insights"],["Contact Us","mailto:hello@careerdevglobal.com"]] },
  { title: "Legal & Trust", links: [["Privacy Policy","/privacy-policy"],["Conditions of Use","/conditions-of-use"],["AI & Professional Standards","/help-center#ai-trust"],["Accessibility","/help-center#accessibility-support"]] },
];
export default function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="CareerDev Global footer">
      <style>{`
        .site-footer nav.site-footer-links { display:grid !important; align-items:stretch !important; gap:10px !important; font-size:14px !important; }
        .site-footer nav.site-footer-links a { display:block !important; visibility:visible !important; opacity:1 !important; color:#add2df !important; text-decoration:none !important; font-size:14px !important; line-height:1.5 !important; transform:none !important; }
        .site-footer nav.site-footer-links a::before { content:none !important; display:none !important; }
        @media (max-width:700px) { .site-footer nav.site-footer-links { gap:11px !important; } .site-footer nav.site-footer-links a { color:#d7edf5 !important; font-size:15px !important; line-height:1.5 !important; padding:3px 0 !important; } }
      `}</style>
      <div className="site-footer-inner">
        <div className="site-footer-brand"><div className="site-footer-logo-wrap">
          <Image className="site-footer-logo" src="/cdg-wordmark.jpg" alt="CareerDev Global — Unleashing Your Potential" width={1208} height={419} sizes="(max-width: 420px) 225px, (max-width: 700px) 250px, (max-width: 1100px) 230px, 280px" />
        </div></div>
        <p className="site-footer-intro">Career development, coaching, leadership development and global talent mobility — powered by human expertise and responsible AI-enabled career intelligence.</p>
        <div className="site-footer-grid">{footerGroups.map((group) => <div className="site-footer-group" key={group.title}><h3>{group.title}</h3><nav className="site-footer-links" aria-label={group.title}>{group.links.map(([label, href]) => href.startsWith("mailto:") ? <a key={label} href={href}>{label}</a> : <Link key={label} href={href}>{label}</Link>)}</nav></div>)}</div>
        <div className="site-footer-bottom"><p>© {new Date().getFullYear()} CareerDev Global. All rights reserved.</p><p><strong>Disclaimer:</strong> Practice informed by relevant professional competency and ethical frameworks. Framework alignment does not by itself imply membership, accreditation, certification, endorsement or formal affiliation.</p></div>
      </div>
    </footer>
  );
}
