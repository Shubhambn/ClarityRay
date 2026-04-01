import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ClarityRay | Chest X-ray Screening (On-Device)',
  description: 'Runs locally in your browser with ONNX Runtime Web. Data never leaves your device.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-8 lg:py-12">
          <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">ClarityRay</h1>
              <p className="text-sm text-slate-300">Browser-only chest X-ray screening. No uploads, no servers.</p>
            </div>
            <div className="text-xs text-slate-400">This is a screening tool, not a diagnosis.</div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
