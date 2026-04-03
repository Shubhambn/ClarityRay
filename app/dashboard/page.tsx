"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Brain } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/layouts/AppShell';
import { api } from '@/utils/api';
import { getToken } from '@/utils/auth';
import { formatDateTime, formatPercent } from '@/utils/format';
import type { AnalysisJob, UserProfile } from '@/utils/types';

function getPrimaryConfidence(job: AnalysisJob): string {
  if (!job.result) return '—';
  return formatPercent(job.result.confidence);
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<AnalysisJob[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/auth');
      return;
    }

    (async () => {
      try {
        const [profileResponse, historyResponse] = await Promise.all([api.getProfile(), api.getHistory()]);
        setProfile(profileResponse);
        setHistory(historyResponse.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load dashboard data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const metrics = useMemo(() => {
    const completed = history.filter((job) => job.status === 'completed').length;
    const processing = history.filter((job) => job.status === 'processing').length;
    const highConfidence = history.filter((job) => (job.result?.confidence ?? 0) >= 0.75).length;

    return [
      { label: 'Total analyses', value: String(history.length), change: `${completed} completed`, color: 'text-[var(--g)]' },
      {
        label: 'In processing',
        value: String(processing),
        change: processing > 0 ? 'Active jobs running' : 'No active jobs',
        color: 'text-[var(--gm)]'
      },
      {
        label: 'High-confidence flags',
        value: String(highConfidence),
        change: 'Review recommended',
        color: 'text-[var(--g)]'
      }
    ];
  }, [history]);

  return (
    <AppShell
      title={`Good day, ${profile?.name ?? 'clinician'}`}
      subtitle="All uploads are processed through protected API jobs."
      ctaLabel="Start analysis"
      ctaHref="/analysis"
    >
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <p className="text-xs text-[var(--muted)]">{metric.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-3xl font-light tracking-[-0.8px] text-[var(--ink)]">{loading ? '…' : metric.value}</p>
              <p className={`text-xs font-medium ${metric.color}`}>{metric.change}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent analysis activity</CardTitle>
              <CardDescription className="mt-1">Latest model runs and confidence summaries</CardDescription>
            </div>
            <Activity size={16} className="text-[var(--muted)]" />
          </CardHeader>

          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No analyses yet. Run your first upload to populate history.</p>
            ) : (
              history.slice(0, 6).map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--off)] px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">{job.fileName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {job.status === 'completed' ? 'Result ready' : 'Processing'} · {formatDateTime(job.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-[var(--gd)]">{getPrimaryConfidence(job)}</p>
                    <p className="text-xs capitalize text-[var(--muted)]">{job.status}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model package</CardTitle>
              <Brain size={16} className="text-[var(--muted)]" />
            </CardHeader>
            <p className="text-sm text-[var(--ink2)]">DenseNet121 · Chest X-ray Screening · v1.0</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Validated for AI-assisted triage workflows. Use outputs only with clinician oversight.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
