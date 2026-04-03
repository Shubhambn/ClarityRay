import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ClarityRay',
  description: 'Open-source, local-first medical AI runtime. Screening tool only, not a medical diagnosis.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
