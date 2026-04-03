import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer } from '@/components/ui/layout';

const cards = [
  {
    title: 'Auth',
    desc: 'Login and signup with protected product access.',
    href: '/auth'
  },
  {
    title: 'Dashboard',
    desc: 'Track your complete analysis history and summaries.',
    href: '/dashboard'
  },
  {
    title: 'Analysis flow',
    desc: 'Upload image, process asynchronously, and inspect confidence + explanation.',
    href: '/analysis'
  },
  {
    title: 'Settings',
    desc: 'Control profile and safety-oriented preferences.',
    href: '/settings'
  }
];

export function FlowCardsSection() {
  return (
    <section className="pb-16">
      <PageContainer>
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((item) => (
            <Card key={item.href} className="group">
              <CardHeader className="mb-2">
                <div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription className="mt-1">{item.desc}</CardDescription>
                </div>
              </CardHeader>
              <Link href={item.href}>
                <Button variant="ghost" className="group-hover:border-[var(--gm)]">
                  Open page <ArrowRight size={14} />
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
