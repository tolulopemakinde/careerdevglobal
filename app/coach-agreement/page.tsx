import Link from "next/link";
import "./styles.css";

export const metadata = {
  title: "Coach Agreement | CareerDev Global",
  description: "Coach marketplace agreement and 70:30 payment terms for CareerDev Global coaches.",
};

const VERSION = "1.0";

export default function CoachAgreementPage() {
  return (
    <main className="coach-agreement-page">
      <div className="coach-agreement-shell">
        <Link className="coach-agreement-back" href="/coach-registration">← Back to Coach Registration</Link>
        <header className="coach-agreement-hero">
          <p className="coach-agreement-eyebrow">CAREERDEV GLOBAL · COACH MARKETPLACE</p>
          <h1>Coach Agreement</h1>
          <p>This agreement sets out the terms that apply when a coach provides services through the CareerDev Global marketplace.</p>
          <div className="coach-agreement-meta"><span>Version {VERSION}</span><span>Effective September 2026</span></div>
        </header>

        <section className="coach-agreement-card coach-agreement-highlight">
          <span className="coach-agreement-badge">70:30 COACH PAYMENT TERMS</span>
          <h2>Coaches receive 70% of the applicable coaching fee.</h2>
          <p>CareerDev Global retains 30% as its marketplace platform share for client discovery and matching, technology, payment administration, communications, marketplace operations, service support, professional-standard processes and related business operations.</p>
          <div className="coach-agreement-example"><div><strong>Example</strong><span>US$100 coaching fee</span></div><div><strong>US$70</strong><span>Coach share</span></div><div><strong>US$30</strong><span>CareerDev Global share</span></div></div>
          <p className="coach-agreement-small">The example is before any separately applicable processor charges, taxes, refunds, chargebacks, currency conversion or other transaction adjustments that are expressly disclosed or required by law.</p>
        </section>

        <div className="coach-agreement-grid">
          <section className="coach-agreement-card"><h2>1. Marketplace relationship</h2><p>CareerDev Global operates a marketplace that can connect clients with coaches. A coach remains responsible for the services they provide, their professional conduct, qualifications, availability and the accuracy of information submitted to the platform.</p></section>
          <section className="coach-agreement-card"><h2>2. Coach profile and eligibility</h2><p>Coaches must provide accurate information about experience, credentials, specializations, services and availability. CareerDev Global may review profiles, request supporting information, pause visibility or decline activation where eligibility or marketplace requirements are not met.</p></section>
          <section className="coach-agreement-card"><h2>3. Payments and payouts</h2><p>For marketplace bookings, the standard revenue share is 70% to the coach and 30% to CareerDev Global. The applicable coaching fee, transaction adjustments and payout information should be shown or communicated through the relevant booking or payout process.</p><p>Refunds, cancellations, chargebacks and other reversals may require an adjustment to a coach payout. Coaches are responsible for their own tax obligations unless applicable law requires otherwise.</p></section>
          <section className="coach-agreement-card"><h2>4. No circumvention</h2><p>Coaches must not intentionally move a marketplace client off-platform to avoid the applicable platform share or transaction process. Any exception to the standard 70:30 arrangement must be expressly agreed in writing by CareerDev Global.</p></section>
          <section className="coach-agreement-card"><h2>5. Professional standards</h2><p>Coaches are expected to act ethically, respect client autonomy and confidentiality, avoid discrimination and conflicts of interest, represent credentials accurately, and work within their competence. CareerDev Global may apply professional-standard and safeguarding requirements appropriate to the service.</p></section>
          <section className="coach-agreement-card"><h2>6. Client relationship and confidentiality</h2><p>Coaches must protect client information and use it only for legitimate service delivery, administration and legal or safety purposes. Coaches should not make guarantees about employment, promotion, immigration, income or other outcomes that they cannot reasonably control.</p></section>
          <section className="coach-agreement-card"><h2>7. AI-enabled services</h2><p>Where CareerDev Global tools or coaches use AI-enabled features, outputs should be reviewed appropriately and should not be presented as infallible. Coaches remain responsible for professional judgment and for correcting material inaccuracies before relying on AI-assisted content.</p></section>
          <section className="coach-agreement-card"><h2>8. Intellectual property</h2><p>Each party retains ownership of its pre-existing intellectual property. Coaches grant CareerDev Global only the permissions reasonably needed to operate, market and administer the coach marketplace, subject to applicable privacy and intellectual-property requirements.</p></section>
          <section className="coach-agreement-card"><h2>9. Changes, suspension and termination</h2><p>CareerDev Global may update marketplace terms when necessary. Material changes to payment terms will be communicated in accordance with applicable agreements and law. A coach may stop accepting new bookings, and CareerDev Global may suspend or terminate marketplace access for policy, safety, eligibility, payment or operational reasons.</p></section>
          <section className="coach-agreement-card"><h2>10. Complaints and disputes</h2><p>Concerns about marketplace services should first be raised through CareerDev Global's support or complaints process. The parties should seek a reasonable resolution before escalating a dispute, subject to any applicable legal rights.</p></section>
        </div>

        <section className="coach-agreement-card coach-agreement-cta">
          <h2>Ready to apply?</h2>
          <p>Review the agreement carefully before submitting your coach marketplace application. Your acceptance is recorded against the agreement version in effect at the time of submission.</p>
          <Link href="/coach-registration" className="coach-agreement-button">Return to Coach Registration</Link>
        </section>

        <p className="coach-agreement-disclaimer">This is a platform agreement draft for CareerDev Global's marketplace workflow and should be reviewed by qualified legal counsel before commercial launch, particularly for governing law, consumer protection, tax, payment-processing and data-protection requirements.</p>
      </div>
    </main>
  );
}
