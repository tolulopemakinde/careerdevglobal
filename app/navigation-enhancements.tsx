'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Enhances the existing marketing header with a compact mobile hamburger menu
 * while preserving the desktop navigation and existing account CTA behavior.
 */
export default function NavigationEnhancements() {
  const router = useRouter();

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.site-header nav');
    const header = document.querySelector<HTMLElement>('.site-header');
    const cta = document.querySelector<HTMLAnchorElement>('.site-header nav a.nav-cta');
    if (!nav || !header) return;

    if (cta) {
      cta.textContent = 'Get Started';
      cta.setAttribute('href', '/account');
      cta.setAttribute('aria-label', 'Get started with a CareerDev Global account');
    }

    let handleCtaClick: ((event: MouseEvent) => void) | null = null;
    if (cta) {
      handleCtaClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        router.push('/account');
      };
      cta.addEventListener('click', handleCtaClick);
    }

    let menuButton = header.querySelector<HTMLButtonElement>('.mobile-menu-toggle');
    if (!menuButton) {
      menuButton = document.createElement('button');
      menuButton.type = 'button';
      menuButton.className = 'mobile-menu-toggle';
      menuButton.setAttribute('aria-label', 'Open navigation menu');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.innerHTML = '<span></span><span></span><span></span>';
      const wrap = header.querySelector('.nav-wrap');
      wrap?.appendChild(menuButton);
    }

    const closeMenu = () => {
      header.classList.remove('mobile-menu-open');
      menuButton?.setAttribute('aria-expanded', 'false');
      menuButton?.setAttribute('aria-label', 'Open navigation menu');
    };

    const toggleMenu = () => {
      const open = header.classList.toggle('mobile-menu-open');
      menuButton?.setAttribute('aria-expanded', String(open));
      menuButton?.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    };

    menuButton.addEventListener('click', toggleMenu);

    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    links.forEach((link) => link.addEventListener('click', closeMenu));

    const handleResize = () => {
      if (window.innerWidth > 700) closeMenu();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (cta && handleCtaClick) cta.removeEventListener('click', handleCtaClick);
      menuButton?.removeEventListener('click', toggleMenu);
      links.forEach((link) => link.removeEventListener('click', closeMenu));
      window.removeEventListener('resize', handleResize);
    };
  }, [router]);

  return null;
}