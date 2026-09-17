"use client";

import { useEffect, useRef } from "react";

const standards = [
  { short: "ICF", name: "International Coaching Federation", href: "https://coachingfederation.org/" },
  { short: "IAEVG", name: "International Association for Educational and Vocational Guidance", href: "https://iaevg.com/" },
  { short: "NCDA", name: "National Career Development Association", href: "https://ncda.org/" },
  { short: "EMCC", name: "EMCC Global", href: "https://emccglobal.org/" },
  { short: "NACE", name: "National Association of Colleges and Employers", href: "https://naceweb.org/" },
];

export default function ProfessionalStandardsCarousel() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const items = [...standards, ...standards];

  useEffect(() => {
    const section = sectionRef.current;
    const footer = document.querySelector("footer.site-footer");
    if (section && footer && footer.parentNode) footer.parentNode.insertBefore(section, footer);
  }, []);

  return (
    <section ref={sectionRef} className="professional-standards" aria-labelledby="professional-standards-title">
      <div className="professional-standards-inner">
        <p className="professional-standards-eyebrow">OUR PROFESSIONAL STANDARDS</p>
        <h2 id="professional-standards-title">Guided by globally recognised professional frameworks</h2>
        <p className="professional-standards-copy">CareerDev Global aligns its career development, coaching, employability and talent practices with relevant professional competency and ethical frameworks.</p>
        <div className="standards-viewport" aria-label="Professional bodies CareerDev Global aligns its practice with">
          <div className="standards-track">
            {items.map((standard, index) => <a className="standard-logo" href={standard.href} target="_blank" rel="noreferrer" aria-label={`${standard.name} — official website`} key={`${standard.short}-${index}`}><span className="standard-mark" aria-hidden="true">{standard.short}</span><span className="standard-name">{standard.name}</span></a>)}
          </div>
        </div>
        <p className="professional-standards-note">Alignment with these frameworks does not by itself imply membership, accreditation, certification, endorsement or formal affiliation.</p>
      </div>
    </section>
  );
}
