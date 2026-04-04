import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import { PersonaProvider } from '@/lib/persona/context';
import TopBar from '@/components/nav/TopBar';
import './globals.css';

/* ── Google Fonts via next/font (self-hosted, COEP-safe) ── */
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

/* ── Metadata ── */
export const metadata: Metadata = {
  title: 'ClarityRay — Local AI Screening',
  description:
    'Browser-native chest X-ray screening. No uploads. No servers.',
};

/* ── Root Layout ── */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body className="grid-bg min-h-screen antialiased">
        {/* Fixed full-viewport overlays — pointer-events: none set in CSS */}
        <div className="scanlines" aria-hidden="true" />
        <div className="vignette" aria-hidden="true" />

        {/* Persona context wraps the entire app */}
        <PersonaProvider>
          <TopBar />
          <div style={{ paddingTop: '48px' }}>{children}</div>
        </PersonaProvider>
      </body>
    </html>
  );
}
