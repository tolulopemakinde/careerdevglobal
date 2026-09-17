'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Keeps the existing marketing-page header markup stable while making the
 * main navigation the single public entry point for login and account creation.
 */
export default function NavigationEnhancements() {
  const router = useRouter();
  const pathname = usePathname();

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

  useEffect(() => {
    if (pathname !== '/career-intelligence') return;

    const syncGuidedPath = () => {
      const items = document.querySelectorAll<HTMLElement>('.ci-next-card .ci-list li');
      if (items.length !== 5) return;

      const labels = [
        ['Understand', 'Your service and desired outcome.'],
        ['Gather', 'Your evidence and career history.'],
        ['Identify', 'Missing information and priorities.'],
        ['Personalize', 'Questions relevant to your goal.'],
        ['Prepare', 'A clear next step for delivery.'],
      ];

      items.forEach((item, index) => {
        const label = item.querySelector('b');
        const description = item.querySelector('span');
        if (label && description) {
          label.textContent = labels[index][0];
          description.textContent = labels[index][1];
        }
      });
    };

    syncGuidedPath();
    const observer = new MutationObserver(syncGuidedPath);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}