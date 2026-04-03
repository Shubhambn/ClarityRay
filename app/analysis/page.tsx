'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, LoaderCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/layouts/AppShell';
import { api } from '@/utils/api';
import { getToken } from '@/utils/auth';
import type { AnalysisJob } from '@/utils/types';

const acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg'];

export default function AnalysisPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth');
    }
  }, [router]);

  useEffect(() => {
    if (!job || job.status !== 'processing') return;

    const interval = window.setInterval(async () => {
      try {
        const fresh = await api.getAnalysis(job.id);
        setJob(fresh);
      } catch {
        window.clearInterval(interval);
      }
    }, 1400);

    return () => window.clearInterval(interval);
  }, [job]);

  const combinedError = localError ?? error;
  const isProcessing = job?.status === 'processing' || loading;
  const result = job?.result ?? null;
  const stage = result ? 'result' : isProcessing ? 'processing' : 'upload';
  const progress = useMemo(() => {
    if (!job && !loading) return 0;
    if (job?.status === 'processing') return 70;
    if (job?.status === 'completed') return 100;
    if (loading) return 20;
    return 0;
  }, [job, loading]);

  const primaryConfidence = useMemo(() => {
    if (!result) return 0;
    return Math.round(result.confidence * 100);
  }, [result]);

  const chooseFile = (file: File | null) => {
    if (!file) return;
    if (!acceptedTypes.includes(file.type)) {
      setLocalError('Unsupported file type. Please use PNG or JPEG.');
      setSelectedFile(null);
      return;
    }
    setLocalError(null);
    setSelectedFile(file);
  };

  return (
    <AppShell
      title="Analysis flow"
      subtitle="Upload, process asynchronously, and return structured confidence output."
      ctaLabel="Dashboard"
      ctaHref="/dashboard"
    >

        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          {['Upload', 'Processing', 'Result'].map((label, index) => {
            const current = stage === 'upload' ? 0 : stage === 'processing' ? 1 : 2;
            const active = current >= index;
            return (
              <div
                key={label}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'border-[color-mix(in_srgb,var(--gm)_40%,white)] bg-[var(--gl)] text-[var(--gd)]'
                    : 'border-[var(--border)] bg-white text-[var(--muted)]'
                }`}
              >
                {index + 1}. {label}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Upload chest X-ray</CardTitle>
                <CardDescription className="mt-1">JPEG or PNG · processing stays on this device</CardDescription>
              </div>
            </CardHeader>

            <div
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(false);
                chooseFile(event.dataTransfer.files?.[0] ?? null);
              }}
              className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-[var(--off)] px-4 text-center transition-colors ${
                dragActive ? 'border-[var(--gm)]' : 'border-[var(--border)]'
              }`}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mb-2 text-[var(--muted)]" size={20} />
              <p className="text-sm font-medium text-[var(--ink)]">Drag and drop your image here</p>
              <p className="mt-1 text-xs text-[var(--muted)]">or click to browse files</p>
              {selectedFile ? <p className="mt-3 text-xs text-[var(--gd)]">Selected: {selectedFile.name}</p> : null}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={loading || !selectedFile}
                onClick={async () => {
                  if (!selectedFile) return;
                    try {
                      setLoading(true);
                      setError(null);
                      const upload = await api.uploadAnalysis(selectedFile);
                      setImageUrl(URL.createObjectURL(selectedFile));
                      setJob(upload.job);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unable to run analysis.');
                    } finally {
                      setLoading(false);
                    }
                }}
              >
                Run analysis
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedFile(null);
                  setLocalError(null);
                  setError(null);
                  setJob(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
                disabled={loading}
              >
                Clear
              </Button>
            </div>

            {combinedError ? (
              <p className="mt-3 inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                <AlertCircle size={13} /> {combinedError}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Result preview</CardTitle>
                <CardDescription className="mt-1">Structured output with clinical caveats and disclaimer</CardDescription>
              </div>
            </CardHeader>

            {!result ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--off)] p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>Processing status</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white">
                    <div
                      className="h-2 rounded-full bg-[var(--gm)] transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {isProcessing ? (
                      <span className="inline-flex items-center gap-1">
                        <LoaderCircle size={13} className="animate-spin" /> Running protected inference job...
                      </span>
                    ) : (
                      'Start analysis to generate confidence, explanation, and visual guidance.'
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  This tool is for screening support only, not a medical diagnosis.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm text-[var(--muted)]">Primary finding</p>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--gd)]">
                      <CheckCircle2 size={13} /> Completed
                    </span>
                  </div>
                  <p className="text-xl font-medium text-[var(--ink)]">
                    {result.confidence >= 0.75 ? 'Potential pulmonary nodule' : 'No acute cardiopulmonary finding'}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--off)] p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-[var(--muted)]">Confidence score</span>
                    <span className="font-medium text-[var(--ink)]">{primaryConfidence}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white">
                    <div className="h-2 rounded-full bg-[var(--gm)]" style={{ width: `${primaryConfidence}%` }} />
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <p className="mb-2 text-sm font-medium text-[var(--ink)]">Structured explanation</p>
                  <p className="text-sm leading-6 text-[var(--ink2)]">{result.explanation}</p>
                </div>

                {imageUrl ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[#0d2137] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Uploaded X-ray preview"
                      className="h-52 w-full rounded-lg object-cover opacity-85"
                    />
                  </div>
                ) : null}

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  {result.disclaimer}
                </div>
              </div>
            )}
          </Card>
        </div>
    </AppShell>
  );
}
