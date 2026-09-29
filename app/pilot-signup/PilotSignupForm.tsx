"use client";

import { FormEvent, useState } from "react";
import styles from "./pilot-signup.module.css";

type Role = "client" | "coach";

type Props = {
  role: Role;
};

const clientStages = [
  "Student",
  "Recent graduate",
  "Early-career professional",
  "Mid-career professional",
  "Senior professional / executive",
  "Career changer",
  "Returning to work",
  "Migrant / internationally mobile professional",
  "Other",
];

const yearsOptions = Array.from({ length: 21 }, (_, index) => index);

export default function PilotSignupForm({ role }: Props) {
  const isClient = role === "client";
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    whatsapp: "",
    linkedinUrl: "",
    careerStage: "",
    careerGoal: "",
    coachingSpecialty: "",
    yearsCoaching: "",
    certification: "",
    whatsappOptIn: false,
    pilotConsent: false,
    website: "",
  });

  const update = (key: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!form.pilotConsent) {
      setError("Please confirm that you agree to participate in the pilot.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/pilot-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          ...form,
          yearsCoaching: form.yearsCoaching ? Number(form.yearsCoaching) : null,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "We could not complete your signup. Please try again.");
      }

      setSubmitted(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not complete your signup. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <section className={styles.success} aria-live="polite">
        <div className={styles.successIcon} aria-hidden="true">✓</div>
        <p className={styles.eyebrow}>PILOT SIGNUP RECEIVED</p>
        <h2>You&apos;re on the CareerDev Global pilot list.</h2>
        <p>
          Thank you for volunteering to test the CareerDev Global Career Intelligence Platform.
          We&apos;ll use the details you provided to organise pilot communication and testing.
        </p>
        <div className={styles.successActions}>
          <a href="/career-intelligence">Explore Career Intelligence</a>
          <a href="/">Return to CareerDev Global</a>
        </div>
      </section>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fieldGrid}>
        <label>
          First name *
          <input
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            autoComplete="given-name"
            required
            maxLength={80}
          />
        </label>
        <label>
          Last name *
          <input
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            autoComplete="family-name"
            required
            maxLength={80}
          />
        </label>
      </div>

      <div className={styles.fieldGrid}>
        <label>
          Email address *
          <input
            type="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            autoComplete="email"
            required
            maxLength={320}
          />
        </label>
        <label>
          WhatsApp number
          <input
            type="tel"
            value={form.whatsapp}
            onChange={(event) => update("whatsapp", event.target.value)}
            autoComplete="tel"
            placeholder="+234..."
            maxLength={30}
          />
        </label>
      </div>

      <label>
        LinkedIn profile
        <input
          type="url"
          value={form.linkedinUrl}
          onChange={(event) => update("linkedinUrl", event.target.value)}
          placeholder="https://www.linkedin.com/in/..."
          maxLength={500}
        />
      </label>

      {isClient ? (
        <>
          <label>
            Current career stage *
            <select
              value={form.careerStage}
              onChange={(event) => update("careerStage", event.target.value)}
              required
            >
              <option value="">Select your stage</option>
              {clientStages.map((stage) => <option key={stage}>{stage}</option>)}
            </select>
          </label>
          <label>
            What career goal or challenge would you like the pilot to help you explore? *
            <textarea
              value={form.careerGoal}
              onChange={(event) => update("careerGoal", event.target.value)}
              rows={5}
              required
              minLength={10}
              maxLength={2000}
              placeholder="For example: changing careers, improving my CV, finding international opportunities, preparing for leadership..."
            />
          </label>
        </>
      ) : (
        <>
          <label>
            Coaching specialty *
            <input
              value={form.coachingSpecialty}
              onChange={(event) => update("coachingSpecialty", event.target.value)}
              required
              maxLength={300}
              placeholder="For example: career transition, leadership, executive coaching"
            />
          </label>
          <label>
            Years of coaching experience *
            <select
              value={form.yearsCoaching}
              onChange={(event) => update("yearsCoaching", event.target.value)}
              required
            >
              <option value="">Select years</option>
              {yearsOptions.map((year) => (
                <option key={year} value={year}>
                  {year === 1 ? "1 year" : year === 0 ? "Less than 1 year" : String(year) + " years"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Coaching certification or credential
            <input
              value={form.certification}
              onChange={(event) => update("certification", event.target.value)}
              maxLength={500}
              placeholder="For example: ICF ACC, PCC, EMCC, university credential"
            />
          </label>
        </>
      )}

      <div className={styles.consentBox}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.whatsappOptIn}
            onChange={(event) => update("whatsappOptIn", event.target.checked)}
          />
          <span>
            I agree to receive CareerDev Global pilot-related WhatsApp messages. I understand I
            can opt out later.
          </span>
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.pilotConsent}
            onChange={(event) => update("pilotConsent", event.target.checked)}
            required
          />
          <span>
            I agree to participate in the CareerDev Global pilot and allow my feedback to be used
            to improve the platform. *
          </span>
        </label>
      </div>

      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => update("website", event.target.value)}
          />
        </label>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <button className={styles.submit} type="submit" disabled={busy}>
        {busy ? "Submitting your pilot signup…" : "Join the " + (isClient ? "Client" : "Coach") + " Pilot"}
      </button>

      <p className={styles.privacyNote}>
        Your information is used to administer the pilot, communicate with you about testing and
        improve CareerDev Global. We do not add you to WhatsApp communications unless you select
        the separate WhatsApp consent above.
      </p>
    </form>
  );
}
