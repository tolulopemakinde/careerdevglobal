'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps the existing marketing-page header markup stable while upgrading
 * navigation behavior and the Get Started destination without duplicating
 * the header component.
 */
export default function NavigationEnhancements() {
  const router = useRouter();

  useEffect(() => {
    const cta = document.querySelector<HTMLAnchorElement>('.site-header nav a.nav-cta');
    if (!cta) return;

    // Account is the single entry point for login and account creation.
    cta.setAttribute('href', '/account');
    cta.setAttribute('aria-label', 'Get started with CareerDev Global');

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
