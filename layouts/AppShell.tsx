'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { clearToken } from '@/utils/auth';
import { privateRoutes } from '@/utils/routes';

interface AppShellProps {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  children: ReactNode;
  /** Optional top status line (e.g. model runtime state) */
  systemStatus?: string | null;
}

export function AppShell({ title, subtitle, ctaLabel, ctaHref, children, systemStatus }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <main className="min-h-screen bg-transparent">
      <div className="mx-auto grid min-h-screen w-full max-w-[1400px] grid-cols-1 border-x border-[var(--border)] border-opacity-40 lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-[var(--border)] bg-black/40 p-5 lg:border-b-0 lg:border-r">
          <p className="mb-8 text-[17px] font-medium tracking-[-0.5px] text-[var(--ink)]">
            Clarity<span className="text-[var(--g)]">Ray</span>
          </p>

          <nav className="space-y-1.5 text-sm">
            {privateRoutes.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                  pathname === item.href
                    ? 'border border-[var(--border)] bg-[var(--gl)] text-[var(--g)]'
                    : 'text-[var(--muted)] hover:bg-white/5 hover:text-[var(--ink)]'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </nav>

          <Button
            variant="ghost"
            className="mt-8 w-full border-[var(--border)] text-[var(--ink2)] hover:bg-white/5"
            onClick={() => {
              clearToken();
              router.replace('/auth');
            }}
          >
            Sign out
          </Button>
        </aside>

        <section className="p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-black/35 px-4 py-3">
            <div>
              <h1 className="text-2xl font-light tracking-[-0.6px] text-[var(--ink)]">{title}</h1>
              <p className="text-xs text-[var(--muted)]">{subtitle}</p>
              {systemStatus ? (
                <p className="mt-2 font-mono-system text-[11px] text-[var(--g)]">{systemStatus}</p>
              ) : null}
            </div>
            {ctaLabel && ctaHref ? (
              <Link href={ctaHref}>
                <Button variant="primary">{ctaLabel}</Button>
              </Link>
            ) : null}
          </header>

          {children}
        </section>
      </div>
    </main>
  );
}
