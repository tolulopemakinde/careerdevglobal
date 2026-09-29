'use client';

import { useState } from 'react';

function NavIcon({ type }: { type: 'services' | 'coaching' | 'pricing' | 'blog' | 'about' | 'start' }) {
  const paths = {
    services: <><path d="M4 8.5h16"/><path d="M6.5 8.5V6.8A1.8 1.8 0 0 1 8.3 5h7.4a1.8 1.8 0 0 1 1.8 1.8v1.7"/><rect x="3" y="8.5" width="18" height="11.5" rx="2"/><path d="M9 13h6"/></>,
    coaching: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/><path d="M18.5 11.5h2"/><path d="M19.5 10.5v2"/></>,
    pricing: <><path d="M4 6.5h11l5 5-7.5 7.5-5-5z"/><circle cx="9" cy="10" r="1"/></>,
    blog: <><path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4"/><path d="M9 12h6M9 16h6"/></>,
    about: <><circle cx="12" cy="12" r="9"/><path d="M12 10.5v6"/><circle cx="12" cy="7.5" r=".7" fill="currentColor" stroke="none"/></>,
    start: <><path d="M5 12h13"/><path d="m13 7 5 5-5 5"/></>,
  }[type];

  return <svg className="nav-menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths}</svg>;
}

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`site-header${menuOpen ? " mobile-menu-open" : ""}`}>
      <div className="container nav-wrap">
        <a className="brand" href="/" aria-label="CareerDev Global home" onClick={closeMenu}>
          <span className="brand-logo-mark" aria-hidden="true">CD</span>
          <span className="brand-logo-text">CareerDev Global</span>
        </a>

        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>

        <nav id="main-navigation" className={menuOpen ? 'nav-open' : ''} aria-label="Main navigation">
          <a href="/#services" onClick={closeMenu}><NavIcon type="services" /><span>Services</span></a>
          <a href="/#coaching" onClick={closeMenu}><NavIcon type="coaching" /><span>Coaching</span></a>
          <a href="/pricing" onClick={closeMenu}><NavIcon type="pricing" /><span>Pricing</span></a>
          <a href="/blog" onClick={closeMenu}><NavIcon type="blog" /><span>Blog</span></a>
          <a href="/#about" onClick={closeMenu}><NavIcon type="about" /><span>About</span></a>
          <a className="nav-cta" href="/account" onClick={closeMenu}><NavIcon type="start" /><span>Get Started</span></a>
        </nav>
      </div>
    </header>
  );
}
