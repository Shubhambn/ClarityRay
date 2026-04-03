'use client';

import Link from 'next/link';
import { type FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageContainer, SectionWrapper } from '@/components/ui/layout';
import { api } from '@/utils/api';
import { setToken } from '@/utils/auth';

type Mode = 'login' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const errors = useMemo(() => {
    if (!submitted) return {} as Record<string, string>;

    const next: Record<string, string> = {};
    if (mode === 'signup' && name.trim().length < 2) next.name = 'Please enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Please enter a valid email address.';
    if (password.length < 8) next.password = 'Password should be at least 8 characters.';
    return next;
  }, [submitted, mode, name, email, password]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);

    if (Object.keys(errors).length > 0) return;

    try {
      setLoading(true);
      setServerError(null);
      const response =
        mode === 'signup'
          ? await api.signup({ name: name.trim(), email: email.trim(), password })
          : await api.login({ email: email.trim(), password });

      setToken(response.token);
      router.push('/dashboard');
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Unable to authenticate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--off)]">
      <SectionWrapper className="py-6">
        <PageContainer className="flex items-center justify-between">
          <Link href="/" className="text-[17px] font-medium tracking-[-0.5px] text-[var(--ink)]">
            Clarity<span className="text-[var(--g)]">Ray</span>
          </Link>
          <Link href="/dashboard" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)]">
            Skip to dashboard
          </Link>
        </PageContainer>
      </SectionWrapper>

      <SectionWrapper className="py-10 sm:py-14" tone="off">
        <PageContainer className="grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-[var(--gl)] px-3 py-1 text-[11px] font-medium text-[var(--gd)]">
              Secure local-first access
            </p>
            <h1 className="mb-3 text-4xl font-light tracking-[-1px] text-[var(--ink)] sm:text-5xl">
              Welcome to the <span className="serif italic text-[var(--g)]">ClarityRay</span> workspace
            </h1>
            <p className="max-w-md text-[15px] leading-7 text-[var(--muted)]">
              Keep your workflow simple and trustworthy. Create an account or sign in to manage local analyses,
              exports, and model updates.
            </p>
          </div>

          <Card className="p-6 sm:p-7">
            <div className="mb-5 inline-flex rounded-[10px] border border-[var(--border)] bg-[var(--off)] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSubmitted(false);
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'login' ? 'bg-white text-[var(--ink)] shadow-sm' : 'text-[var(--muted)]'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setSubmitted(false);
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  mode === 'signup' ? 'bg-white text-[var(--ink)] shadow-sm' : 'text-[var(--muted)]'
                }`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3.5">
              {mode === 'signup' ? (
                <Input
                  label="Full name"
                  placeholder="Dr. Priya Sharma"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  error={errors.name}
                />
              ) : null}

              <Input
                label="Email"
                type="email"
                placeholder="you@clinic.org"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={errors.email}
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={errors.password}
                hint="At least 8 characters"
              />

              <Button type="submit" variant="primary" fullWidth size="lg" className="mt-2" disabled={loading}>
                {loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={15} />
              </Button>

              {serverError ? <p className="text-xs text-red-600">{serverError}</p> : null}

              <p className="rounded-lg bg-[var(--gl)] px-3 py-2 text-xs text-[var(--gd)]">
                Your medical scans remain local. Authentication only manages your workspace preferences.
              </p>
            </form>
          </Card>
        </PageContainer>
      </SectionWrapper>
    </main>
  );
}
