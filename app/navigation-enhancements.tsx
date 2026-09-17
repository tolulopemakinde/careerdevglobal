'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps the existing marketing-page header markup stable while making the
 * main navigation the single public entry point for login and account creation.
 */
export default function NavigationEnhancements() {
  const router = useRouter();

  useEffect(() => {
    const cta = document.querySelector<HTMLAnchorElement>('.site-header nav a.nav-cta');
    if (!cta) return;

    // Login / Create Account is intentionally part of the main menu.
    cta.textContent = 'Log in / Create Account';
    cta.setAttribute('href', '/account');
    cta.setAttribute('aria-label', 'Log in or create a CareerDev Global account');

    const handleClick = (event: MouseEvent) => {
      // Preserve normal browser behaviors such as Cmd/Ctrl-click and middle-click.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      router.push('/account');
    };

    cta.addEventListener('click', handleClick);
    return () => cta.removeEventListener('click', handleClick);
  }, [router]);

  return null;
}
