'use client';

import Link from "next/link";
import { useState } from "react";
import { helpGroups } from "./help-groups";
import { filterHelpGroups } from "./search";

export default function HelpTopics() {
  const [query, setQuery] = useState('');
  const groups = filterHelpGroups(helpGroups, query);
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  return (
    <main className="faq-page">
      <section className="faq-hero help-hero">
        <span>CAREERDEV GLOBAL HELP CENTER</span>
        <h1>How can we help?</h1>
        <p>Clear, practical guidance for clients and coaches using CareerDev Global, its features and AI-enabled career intelligence.</p>
        <div className="help-search" role="search" aria-label="Help Center search">
          <span aria-hidden="true">⌕</span>
          <input type="search" aria-label="Search help topics" placeholder="Search help topics..." value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby="help-search-status" />
          <span className="search-hint">Try “coach”, “CV”, or “AI”</span>
        </div>
      </section>

      <div className="faq-layout">
        <aside className="faq-nav" aria-label="Help Center sections">
          {groups.map((group) => <a key={group.id} href={`#${group.id}`}>{group.title}</a>)}
        </aside>

        <div className="faq-list">
          <p id="help-search-status" role="status">{query.trim() ? `${count} matching help ${count === 1 ? 'topic' : 'topics'}` : 'Browse all help topics'}</p>
          {count === 0 && <p>No help topics match your search. Try another term or contact our team below.</p>}
          {groups.map((group) => (
            <section id={group.id} className="faq-group" key={group.id}>
              <h2>{group.title}</h2>
              {group.items.map(([question, answer]) => (
                <details key={`${query}:${question}`} open={query.trim() ? true : undefined}>
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
