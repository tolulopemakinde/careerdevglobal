'use client';

import Image from 'next/image';
import { useState } from 'react';

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className={`site-header${menuOpen ? " mobile-menu-open" : ""}`}>
      <div className="container nav-wrap">
        <a className="brand" href="/" aria-label="CareerDev Global home" onClick={closeMenu}>
          <Image className="site-brand-logo" src="/cdg-wordmark.jpg" alt="CareerDev Global — Unleashing Your Potential" width={1208} height={419} priority sizes="(max-width: 420px) 190px, (max-width: 700px) 210px, (max-width: 1100px) 250px, 300px" />
        </a>
        <button className="mobile-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((open) => !open)}>
          <span className="mobile-menu-icon" aria-hidden="true">☰</span>
        </button>
        <nav id="main-navigation" className={menuOpen ? 'nav-open' : ''} aria-label="Main navigation">
          <a href="/#services" onClick={closeMenu}>Services</a><a href="/#coaching" onClick={closeMenu}>Coaching</a><a href="/pricing" onClick={closeMenu}>Pricing</a><a href="/blog" onClick={closeMenu}>Blog</a><a href="/#about" onClick={closeMenu}>About</a><a className="nav-cta" href="/account" onClick={closeMenu}>Get Started</a>
        </nav>
      </div>
    </header>
  );
}
