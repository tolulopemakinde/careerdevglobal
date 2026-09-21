'use client';

import { useState } from 'react';

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
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
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>

        <nav id="main-navigation" className={menuOpen ? 'nav-open' : ''} aria-label="Main navigation">
          <a href="/#services" onClick={closeMenu}>Services</a>
          <a href="/#coaching" onClick={closeMenu}>Coaching</a>
          <a href="/pricing" onClick={closeMenu}>Pricing</a>
          <a href="/blog" onClick={closeMenu}>Blog</a>
          <a href="/#about" onClick={closeMenu}>About</a>
          <a className="nav-cta" href="/account" onClick={closeMenu}>Get Started</a>
        </nav>
      </div>
    </header>
  );
}
