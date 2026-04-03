import { ShieldCheck } from 'lucide-react';
import { PageContainer } from '@/components/ui/layout';
import { HeroSection } from '@/sections/landing/HeroSection';
import { FlowCardsSection } from '@/sections/landing/FlowCardsSection';

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-[var(--border)] bg-white">
        <PageContainer className="flex items-center justify-between py-4">
          <p className="text-[17px] font-medium tracking-[-0.5px] text-[var(--ink)]">
            Clarity<span className="text-[var(--g)]">Ray</span>
          </p>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <ShieldCheck size={14} className="text-[var(--gm)]" />
            Local-first · Screening only
          </div>
        </PageContainer>
      </header>

      <HeroSection />
      <FlowCardsSection />
    </main>
  );
}
