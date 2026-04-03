import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-10', className)}>{children}</div>;
}

export function SectionWrapper({
  children,
  className,
  tone = 'light'
}: {
  children: ReactNode;
  className?: string;
  tone?: 'light' | 'off' | 'dark';
}) {
  const toneStyles = {
    light: 'bg-white text-[var(--ink)]',
    off: 'bg-[var(--off)] text-[var(--ink)]',
    dark: 'bg-[#0D1117] text-white'
  };

  return <section className={cn('py-10 sm:py-12', toneStyles[tone], className)}>{children}</section>;
}
