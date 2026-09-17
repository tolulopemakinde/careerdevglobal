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

    cta.textContent = 'Get Started';
    cta.setAttribute('href', '/account');
    cta.setAttribute('aria-label', 'Get started with a CareerDev Global account');

    const handleClick = (event: MouseEvent) => {
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
