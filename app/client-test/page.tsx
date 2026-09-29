import type { Metadata } from "next";
import Link from "next/link";
import PilotSignupForm from "../pilot-signup/PilotSignupForm";
import styles from "../pilot-signup/pilot-signup.module.css";

export const metadata: Metadata = {
  title: "Client Pilot | CareerDev Global",
  description:
    "Join the CareerDev Global Client Pilot and help test the Career Intelligence Platform.",
};

export default function ClientTestPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>CAREERDEV GLOBAL • CLIENT PILOT</p>
          <h1>Help us build a smarter career journey for people everywhere.</h1>
          <p>
            Join the CareerDev Global Client Pilot and help us test the Career Intelligence
            Platform, career discovery, professional positioning and career-development workflows.
          </p>
          <div className={styles.heroActions}>
            <Link href="/coach-test">Are you a coach? Join the Coach Pilot →</Link>
            <Link href="/career-intelligence">Explore Career Intelligence →</Link>
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.formCard}>
          <p className={styles.eyebrow}>CLIENT TESTER SIGNUP</p>
          <h2>Tell us a little about yourself.</h2>
          <p className={styles.formIntro}>
            This pilot is designed to help us learn what clients need, where the experience can be
            clearer and how AI-enabled career intelligence can better support human-led career
            development.
          </p>
          <PilotSignupForm role="client" />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sideCard}>
            <h2>What you&apos;ll help test</h2>
            <p>Your participation can help us improve the experience before wider rollout.</p>
            <ul className={styles.sideList}>
              <li>Career discovery and direction</li>
              <li>Career goals and challenge identification</li>
              <li>Professional positioning and job-search support</li>
              <li>AI-assisted career intelligence workflows</li>
              <li>Coach-supported validation and next steps</li>
            </ul>
          </div>
          <div className={styles.sideCard}>
            <h2>Human-led, AI-enabled</h2>
            <p>
              AI supports analysis and drafting. Career professionals remain responsible for
              high-impact recommendations and client-facing decisions.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
