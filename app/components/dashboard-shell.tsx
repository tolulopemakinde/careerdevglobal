'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { dashboardNavigation, type DashboardRole } from './dashboard-navigation';
import './dashboard-shell.css';

const paths: Record<string, string> = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 11h16m-11 4h2m3 0h2',
  wallet: 'M3 5h17v16H3ZM3 9h17m-5 4h6v5h-6Z',
  briefcase: 'M8 7V3h8v4M3 7h18v14H3ZM3 12l9 4 9-4',
  badge: 'm12 3 3 3 4 1v6l-7 8-7-8V7l4-1Zm-4 8 3 3 5-6',
  edit: 'm4 16 12-12 4 4L8 20H4ZM13 7l4 4',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  journey: 'M5 4v12a4 4 0 0 0 8 0V8a3 3 0 0 1 6 0v12M2 4h6m8 16h6',
};

export default function DashboardShell({ role, children }: { role: DashboardRole; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('overview');
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const destinations = dashboardNavigation[role];
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace(`/${role}/login?next=/${role}-dashboard`);
    });
    return () => subscription.unsubscribe();
  }, [role, router]);

  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1) || 'overview';
      setActive(destinations.some(item => item.id === id) ? id : 'overview');
      if (window.location.hash) document.getElementById(id)?.scrollIntoView();
    };
    sync();
    // Profile panels may finish loading after the dashboard shell mounts.
    const observer = new MutationObserver(() => {
      const id = window.location.hash.slice(1);
      if (id && document.getElementById(id)) { sync(); observer.disconnect(); }
    });
    if (window.location.hash && !document.getElementById(window.location.hash.slice(1))) {
      observer.observe(content.current!, { childList: true, subtree: true });
    }
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { observer.disconnect(); window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, [destinations, pathname]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const resize = () => setOpen(false);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Keep all background UI out of the modal's keyboard and accessibility tree.
    const background = Array.from(document.body.children).filter(element => element instanceof HTMLElement && !element.contains(drawer.current)) as HTMLElement[];
    const previous = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    if (content.current) content.current.inert = true;
    const focusable = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, i) => { element.inert = previous[i]; });
      if (content.current) content.current.inert = false;
      document.removeEventListener('keydown', keydown);
    };
  }, [open]);

  function navigate(id: string) {
    setActive(id);
    setOpen(false);
    // Native fragment navigation supplies history/refresh support without reloading.
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.focus({ preventScroll: true });
    });
  }

  return <div className={`dashboard-shell${collapsed ? ' is-collapsed' : ''}${open ? ' drawer-open' : ''}`}>
    <div className="dashboard-mobile-bar" inert={open}><button ref={trigger} className="dashboard-menu-button" aria-label="Open dashboard navigation" aria-expanded={open} aria-controls="dashboard-sidebar" onClick={() => setOpen(true)}><span className="dashboard-hamburger" aria-hidden="true"><i/><i/><i/></span></button><span>{role === 'client' ? 'Client' : 'Coach'} Dashboard</span></div>
    {open && <div className="dashboard-backdrop" onClick={close} aria-hidden="true"/>}
    <aside ref={drawer} id="dashboard-sidebar" className="dashboard-sidebar" role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label={`${role === 'client' ? 'Client' : 'Coach'} dashboard navigation`}>
      <div className="dashboard-sidebar-top"><span className="dashboard-monogram" aria-hidden="true">CD</span><span className="dashboard-sidebar-copy">CareerDev Global<small>{role === 'client' ? 'Your career journey' : 'Your coaching practice'}</small></span></div>
      <button className="dashboard-menu-button dashboard-desktop-toggle" aria-label={collapsed ? 'Expand dashboard navigation' : 'Collapse dashboard navigation'} aria-expanded={!collapsed} aria-controls="dashboard-destinations" title={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setCollapsed(value => !value)}><span className="dashboard-hamburger" aria-hidden="true"><i/><i/><i/></span><span className="dashboard-sidebar-copy">Collapse menu</span></button>
      <button className="dashboard-menu-button dashboard-drawer-close" onClick={close} aria-label="Close dashboard navigation">✕ <span>Close menu</span></button>
      <nav id="dashboard-destinations" aria-label={`${role} dashboard sections`}>{destinations.map(item => <a key={item.id} href={`${pathname}#${item.id}`} className="dashboard-destination" aria-current={active === item.id ? 'location' : undefined} aria-label={item.label} title={item.label} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) navigate(item.id); }}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[item.icon]}/></svg><span className="dashboard-sidebar-copy">{item.label}</span><span className="dashboard-tooltip" aria-hidden="true">{item.label}</span></a>)}</nav>
      <Link className="dashboard-destination dashboard-home" href="/" aria-label="CareerDev Global homepage" title="CareerDev Global homepage"><span aria-hidden="true">↗</span><span className="dashboard-sidebar-copy">CareerDev Global home</span></Link>
    </aside>
    <div ref={content} className="dashboard-content">{children}</div>
  </div>;
}
