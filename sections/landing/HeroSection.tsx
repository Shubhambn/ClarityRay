import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { PageContainer } from '@/components/ui/layout';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="py-14 sm:py-20">
      <PageContainer>
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_minmax(280px,440px)]">
          <div>
            <p className="mb-4 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--gl)] px-3 py-1 text-xs font-medium text-[var(--g)]">
              AI-assisted chest X-ray screening · local inference
            </p>
            <h1 className="mb-4 text-4xl font-light leading-tight tracking-[-1px] text-[var(--ink)] sm:text-5xl">
              ClarityRay <span className="serif italic text-[var(--g)]">screening runtime</span>
            </h1>
            <p className="max-w-xl text-[15px] leading-7 text-[var(--muted)]">
              Load a model from the library, upload a scan, and review structured outputs with attention maps. All inference
              runs in your browser; scan data does not leave your device.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/models">
                <Button variant="primary" size="lg">
                  Browse models
                </Button>
              </Link>
              <Link href="/analysis">
                <Button variant="ghost" size="lg" className="border-[var(--border)] text-[var(--ink2)] hover:bg-white/5">
                  Open analysis
                </Button>
              </Link>
            </div>
            <div className="mt-6 inline-flex items-center gap-2 text-xs text-[var(--muted)]">
              <ShieldCheck size={14} className="text-[var(--gm)]" /> Screening support only · not a diagnosis
            </div>
          </div>

          <div
            className="cr-panel-scanlines relative aspect-[4/3] w-full max-w-md justify-self-end rounded-xl border border-[var(--border)] bg-black/50 lg:max-w-none"
            aria-hidden
          >
            <div className="relative z-10 flex h-full min-h-[220px] flex-col p-5">
              <div className="font-mono-system flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--g)]">
                <span>preview.clarity</span>
                <span className="text-[var(--muted)]">idle</span>
              </div>
              <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/30 px-4 text-center">
                <p className="font-mono-system text-xs text-[var(--muted)]">Awaiting scan input</p>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                  Static preview — connect a model and open Analysis to run the live pipeline.
                </p>
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
