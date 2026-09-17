'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../lib/supabase-browser';

/** Enhances the existing marketing header with responsive, role-aware navigation. */
export default function NavigationEnhancements() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    const nav = document.querySelector<HTMLElement>('.site-header nav');
    const header = document.querySelector<HTMLElement>('.site-header');
    if (!nav || !header) return;

    const cta = header.querySelector<HTMLAnchorElement>('nav a.nav-cta');
    const brand = header.querySelector<HTMLAnchorElement>('.brand');

    if (brand) {
      brand.setAttribute('href', '/');
      brand.setAttribute('aria-label', 'CareerDev Global home');
    }

    const applyAccountNavigation = async () => {
      let destination = '/account';
      let label = 'Get Started';
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roleData } = await supabase.rpc('get_my_role');
        const role = Array.isArray(roleData) ? roleData[0]?.role : roleData?.role;
        if (role === 'coach') { destination = '/coach-dashboard'; label = 'Coach Dashboard'; }
        else if (role === 'client') { destination = '/client-dashboard'; label = 'Client Dashboard'; }
      }
      if (cancelled || !cta) return;
      cta.textContent = label;
      cta.setAttribute('href', destination);
      cta.setAttribute('aria-label', label);
      const handleCtaClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        router.push(destination);
      };
      cta.addEventListener('click', handleCtaClick);
      cleanupCta = () => cta.removeEventListener('click', handleCtaClick);
    };

    let cleanupCta = () => {};
    applyAccountNavigation();

    // Career Intelligence accepts common career evidence formats. The page's
    // legacy validator expects text/plain for some files, so normalize the
    // browser File MIME type while preserving the original filename/bytes.
    // The secure document processor uses the filename extension to route the
    // uploaded bytes and then performs server-side AI extraction.
    let cleanupDocumentInput = () => {};
    if (window.location.pathname === '/career-intelligence') {
      const input = document.querySelector<HTMLInputElement>('#career-document');
      if (input) {
        input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp,.gif';
        const handleDocumentChange = () => {
          const files = Array.from(input.files || []);
          const supported = /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|txt|png|jpe?g|webp|gif)$/i;
          const needsNormalization = files.some((file) => supported.test(file.name) && !['application/pdf','text/plain'].includes(file.type));
          if (!needsNormalization) return;
          const transfer = new DataTransfer();
          files.forEach((file) => {
            const normalized = ['application/pdf','text/plain'].includes(file.type)
              ? file
              : new File([file], file.name, { type: 'text/plain', lastModified: file.lastModified });
            transfer.items.add(normalized);
          });
          try { input.files = transfer.files; } catch { /* Browser may expose a read-only FileList. */ }
        };
        input.addEventListener('change', handleDocumentChange, true);
        cleanupDocumentInput = () => input.removeEventListener('change', handleDocumentChange, true);
      }
    }

    let menuButton = header.querySelector<HTMLButtonElement>('.mobile-menu-toggle');
    if (!menuButton) {
      menuButton = document.createElement('button');
      menuButton.type = 'button';
      menuButton.className = 'mobile-menu-toggle';
      menuButton.setAttribute('aria-label', 'Open navigation menu');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.innerHTML = '<span></span><span></span><span></span>';
      header.querySelector('.nav-wrap')?.appendChild(menuButton);
    }
    const closeMenu = () => { header.classList.remove('mobile-menu-open'); menuButton?.setAttribute('aria-expanded', 'false'); menuButton?.setAttribute('aria-label', 'Open navigation menu'); };
    const toggleMenu = () => { const open = header.classList.toggle('mobile-menu-open'); menuButton?.setAttribute('aria-expanded', String(open)); menuButton?.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu'); };
    menuButton.addEventListener('click', toggleMenu);
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    links.forEach((link) => link.addEventListener('click', closeMenu));
    const handleResize = () => { if (window.innerWidth > 700) closeMenu(); };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      cleanupCta();
      cleanupDocumentInput();
      menuButton?.removeEventListener('click', toggleMenu);
      links.forEach((link) => link.removeEventListener('click', closeMenu));
      window.removeEventListener('resize', handleResize);
    };
  }, [router]);

  return null;
}
