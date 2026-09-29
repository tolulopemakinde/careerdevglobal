import type { Metadata } from "next";
import Link from "next/link";
import PilotSignupForm from "../pilot-signup/PilotSignupForm";
import styles from "../pilot-signup/pilot-signup.module.css";

export const metadata: Metadata = {
  title: "Coach Pilot | CareerDev Global",
  description:
    "Join the CareerDev Global Coach Pilot and help test coach-supported Career Intelligence workflows.",
};

export default function CoachTestPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>CAREERDEV GLOBAL • COACH PILOT</p>
          <h1>Help us build AI-supported workflows that strengthen professional coaching.</h1>
          <p>
            Join the CareerDev Global Coach Pilot and help test the Career Intelligence Platform,
            coach workflows, client insights and AI-supported career-development processes.
          </p>
          <div className={styles.heroActions}>
            <Link href="/client-test">Are you a client? Join the Client Pilot →</Link>
            <Link href="/coach-registration">Learn about coaching with us →</Link>
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.formCard}>
          <p className={styles.eyebrow}>COACH TESTER SIGNUP</p>
          <h2>Tell us about your coaching practice.</h2>
          <p className={styles.formIntro}>
            Your experience will help us test whether AI can reduce administrative and analytical
            friction while keeping professional judgment, client validation and final decisions
            with the coach.
          </p>
          <PilotSignupForm role="coach" />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sideCard}>
            <h2>What you&apos;ll help test</h2>
            <p>Coach testers will help us evaluate practical workflows such as:</p>
            <ul className={styles.sideList}>
              <li>Client information and career-intent analysis</li>
              <li>AI-assisted service and proposal drafting</li>
              <li>Coach review and professional validation</li>
              <li>Career Intelligence Platform workflows</li>
              <li>Client communication and feedback loops</li>
            </ul>
          </div>
          <div className={styles.sideCard}>
            <h2>Professional judgment stays central</h2>
            <p>
              The platform is designed to assist coaches, not replace them. Coaches review and
              validate client-facing recommendations before use.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
