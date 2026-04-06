'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePersona } from '@/lib/persona/context';
import type { ClarityRayStatus } from '@/hooks/useClarityRay';

/* ── Props ── */
interface TopBarProps {
  /** Pass the current hook status so the logo dot reacts to inference state. */
  status?: ClarityRayStatus;
}

/* ── Nav links ── */
const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/models', label: 'Models' },
  { href: '/about', label: 'About' },
] as const;

/* ── Persona badge config ── */
const PERSONA_BADGE = {
  researcher: { label: 'DEV', color: 'var(--persona-dev)' },
  doctor:     { label: 'MD',  color: 'var(--persona-md)' },
  patient:    { label: 'USER',color: 'var(--persona-user)' },
  null:       { label: 'SETUP', color: 'var(--persona-setup)' },
} satisfies Record<string, { label: string; color: string }>;

export default function TopBar({ status = 'idle' }: TopBarProps) {
  const pathname = usePathname() ?? '';
  const { persona } = usePersona();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const personaKey = (persona ?? 'null') as keyof typeof PERSONA_BADGE;
  const badge = PERSONA_BADGE[personaKey];
  const isNullPersona = persona === null;

  /* Dot pulses when model is hot (ready / processing) */
  const dotActive = status === 'ready' || status === 'processing';

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      {/* ── Bar ── */}
      <header className="topbar" role="banner">
        {/* LEFT — Logo */}
        <div className="topbar-left">
          <Link href="/" className="topbar-logo" aria-label="ClarityRay home">
            <span
              className={`status-dot topbar-logo-dot${dotActive ? '' : ' topbar-logo-dot--static'}`}
              aria-hidden="true"
            />
            <span className="topbar-logo-text">CLARITY</span>
          </Link>
        </div>

        {/* CENTER — Desktop nav */}
        <nav className="topbar-center" aria-label="Primary navigation">
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : (pathname as string).startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`topbar-nav-link${active ? ' topbar-nav-link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* RIGHT — Badge + Privacy + Hamburger */}
        <div className="topbar-right">
          {/* Persona badge */}
          {isNullPersona ? (
            <Link href="/onboarding" className="topbar-badge" style={{ '--badge-color': badge.color } as React.CSSProperties} aria-label="Set up persona">
              {badge.label}
            </Link>
          ) : (
            <span className="topbar-badge" style={{ '--badge-color': badge.color } as React.CSSProperties} aria-label={`Persona: ${persona}`}>
              {badge.label}
            </span>
          )}

          {/* Privacy indicator — always visible, never interactive */}
          <span className="topbar-privacy" aria-label="All inference runs locally">
            <LockIcon />
            <span>Local</span>
          </span>

          {/* Hamburger — mobile only */}
          <button
            className="topbar-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="topbar-drawer"
          >
            <HamburgerIcon />
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div
          className="topbar-overlay"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}
      <nav
        id="topbar-drawer"
        className={`topbar-drawer${drawerOpen ? ' topbar-drawer--open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!drawerOpen}
      >
        <div className="topbar-drawer-header">
          <span className="topbar-logo-text" style={{ fontSize: '0.875rem' }}>CLARITY</span>
          <button
            className="topbar-drawer-close"
            onClick={closeDrawer}
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>
        {NAV_LINKS.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href as string);
          return (
            <Link
              key={href}
              href={href}
              className={`topbar-drawer-link${active ? ' topbar-drawer-link--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={closeDrawer}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── Scoped styles ── */}
      <style>{`
        /* ── Persona badge color tokens ── */
        :root {
          --persona-dev:   #3b82f6; /* blue-500 */
          --persona-md:    var(--accent-primary); /* green */
          --persona-user:  #6b7280; /* gray-500 */
          --persona-setup: #f59e0b; /* amber-500 */
        }

        /* ── Bar shell ── */
        .topbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          background: rgba(0, 0, 0, 0.80);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid var(--border-subtle);
        }

        /* ── Left ── */
        .topbar-left {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .topbar-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }
        .topbar-logo-dot {
          flex-shrink: 0;
        }
        .topbar-logo-dot--static {
          animation: none;
          background: #4b5563; /* gray-600 */
          box-shadow: none;
        }
        .topbar-logo-text {
          font-family: var(--font-ui);
          font-size: 0.8125rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: var(--text-primary);
        }

        /* ── Center ── */
        .topbar-center {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .topbar-nav-link {
          padding: 4px 12px;
          font-family: var(--font-ui);
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary);
          text-decoration: none;
          border-bottom: 2px solid transparent;
          transition: color 0.15s, border-color 0.15s;
          line-height: 40px; /* optical alignment within 48px bar */
        }
        .topbar-nav-link:hover {
          color: var(--text-primary);
        }
        .topbar-nav-link--active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }

        /* ── Right ── */
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        /* Persona badge */
        .topbar-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          color: var(--badge-color, var(--text-secondary));
          border: 1px solid var(--badge-color, var(--border-subtle));
          background: transparent;
          text-decoration: none;
          white-space: nowrap;
          transition: opacity 0.15s;
          cursor: default;
        }
        a.topbar-badge {
          cursor: pointer;
        }
        a.topbar-badge:hover {
          opacity: 0.75;
        }

        /* Privacy indicator */
        .topbar-privacy {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          font-weight: 500;
          color: var(--accent-primary);
          white-space: nowrap;
          pointer-events: none;
          user-select: none;
        }
        .topbar-privacy svg {
          width: 11px;
          height: 11px;
          flex-shrink: 0;
        }

        /* Hamburger */
        .topbar-hamburger {
          display: none;
          background: none;
          border: none;
          width: 44px;
          height: 44px;
          min-width: 44px;
          min-height: 44px;
          padding: 0;
          cursor: pointer;
          color: var(--text-secondary);
          transition: color 0.15s;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
        }
        .topbar-hamburger:hover {
          color: var(--text-primary);
        }
        .topbar-hamburger svg {
          width: 20px;
          height: 20px;
          display: block;
        }

        /* ── Mobile drawer ── */
        .topbar-overlay {
          position: fixed;
          inset: 0;
          z-index: 110;
          background: rgba(0, 0, 0, 0.6);
        }
        .topbar-drawer {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 120;
          width: 240px;
          display: flex;
          flex-direction: column;
          background: var(--bg-elevated, #0a0a0a);
          border-right: 1px solid var(--border-accent);
          transform: translateX(-100%);
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 0;
        }
        .topbar-drawer--open {
          transform: translateX(0);
        }
        .topbar-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          height: 48px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .topbar-drawer-close {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 0.875rem;
          cursor: pointer;
          min-width: 44px;
          min-height: 44px;
          padding: 0;
          transition: color 0.15s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
        }
        .topbar-drawer-close:hover {
          color: var(--text-primary);
        }
        .topbar-drawer-link {
          display: block;
          padding: 12px 20px;
          min-height: 44px;
          font-family: var(--font-ui);
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          text-decoration: none;
          border-left: 2px solid transparent;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          touch-action: manipulation;
        }
        .topbar-drawer-link:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.03);
        }
        .topbar-drawer-link--active {
          color: var(--accent-primary);
          border-left-color: var(--accent-primary);
          background: rgba(34,197,94,0.05);
        }

        /* ── Responsive breakpoints ── */
        @media (max-width: 767px) {
          .topbar-center {
            display: none;
          }
          .topbar-hamburger {
            display: flex;
          }
        }
        @media (min-width: 768px) {
          .topbar-drawer,
          .topbar-overlay {
            display: none;
          }
        }
      `}</style>
    </>
  );
}

/* ── Inline SVG icons ── */
function LockIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" opacity="0.9" />
      <path
        d="M4 5.5V3.5a2 2 0 014 0v2"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
