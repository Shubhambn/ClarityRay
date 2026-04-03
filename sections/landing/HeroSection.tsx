import { ShieldCheck } from 'lucide-react';
import { PageContainer } from '@/components/ui/layout';

export function HeroSection() {
  return (
    <section className="py-14 sm:py-16">
      <PageContainer>
        <div className="mb-10 max-w-xl">
          <p className="mb-4 inline-flex items-center rounded-full bg-[var(--gl)] px-3 py-1 text-xs font-medium text-[var(--gd)]">
            AI-assisted chest X-ray screening workflow
          </p>
          <h1 className="mb-4 text-4xl font-light leading-tight tracking-[-1px] text-[var(--ink)] sm:text-5xl">
            ClarityRay <span className="serif italic text-[var(--g)]">clinical workspace</span>
          </h1>
          <p className="text-[15px] leading-7 text-[var(--muted)]">
            Upload scans, review structured confidence outputs, and manage analysis history in one local-first,
            privacy-forward workspace.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--muted)]">
            <ShieldCheck size={14} className="text-[var(--gm)]" /> Screening support only · not a diagnosis
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
