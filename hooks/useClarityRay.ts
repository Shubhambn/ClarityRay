'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';
import { postprocess, type SafeResult } from '@/lib/clarity/postprocess';
import { validateSpec, type ClaritySpec } from '@/lib/clarity/types';
import { preprocessImage } from '@/lib/clarity/preprocess';
import { loadModel } from '@/lib/clarity/loader';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClarityRayStatus =
  | 'idle'
  | 'loading_manifest'
  | 'loading_spec'
  | 'downloading_model'
  | 'verifying_model'
  | 'ready'
  | 'processing'
  | 'complete'
  | 'error';

export interface SystemLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  inputShape: number[];
  outputClasses: string[];
  bodypart: string;
  modality: string;
}

export interface UseClarityRayReturn {
  status: ClarityRayStatus;
  result: SafeResult | null;
  error: string | null;
  modelInfo: ModelInfo | null;
  logs: SystemLog[];
  runAnalysis: (file: File) => Promise<void>;
  reset: () => void;
}

// ─── Module-level session cache ───────────────────────────────────────────────
// Cached at module level so the InferenceSession survives re-renders.

const sessionCache = new Map<string, ort.InferenceSession>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_SLUG = 'densenet121-chest';
const SELECTED_MODEL_KEY = 'clarityray_selected_model';

function makeLog(
  level: SystemLog['level'],
  message: string,
): SystemLog {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    level,
    message,
  };
}

function modelInfoFromSpec(spec: ClaritySpec): ModelInfo {
  return {
    id: spec.id,
    name: spec.name,
    version: spec.version,
    inputShape: spec.input.shape,
    outputClasses: spec.output.classes,
    bodypart: spec.bodypart,
    modality: spec.modality,
  };
}

function plainError(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Unexpected error while running analysis.';
  }

  const msg = err.message;

  if (/WebAssembly/i.test(msg)) {
    return 'Your browser does not support local AI analysis. Please use a recent Chrome, Firefox, or Edge.';
  }
  if (/integrity check failed/i.test(msg)) {
    return 'Model integrity check failed. The downloaded model may be corrupt. Please reload.';
  }
  if (/Failed to fetch model/i.test(msg)) {
    return 'Model download failed. Please check your connection and try again.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return 'Network error. Please check your connection and retry.';
  }
  if (/Invalid image tensor shape/i.test(msg)) {
    return 'The selected image format is not supported for analysis.';
  }

  return msg;
}

/**
 * Resolve the clarity.json URL and model .onnx URL for a given slug.
 *
 * Strategy (in order):
 * 1. Try GET /api/models/{slug} — used when a Next.js route handler exists.
 * 2. Fall back to reading local manifest at /models/manifest.json.
 * 3. If manifest fails, synthesise local paths directly from the slug.
 */
async function resolveModelUrls(
  slug: string,
): Promise<{ specUrl: string; modelUrl: string }> {
  // Attempt 1 — platform API route
  try {
    const apiRes = await fetch(`/api/models/${slug}`, { cache: 'no-cache' });
    if (apiRes.ok) {
      const json: unknown = await apiRes.json();
      if (
        typeof json === 'object' &&
        json !== null &&
        'clarity_url' in json &&
        typeof (json as Record<string, unknown>).clarity_url === 'string'
      ) {
        const record = json as Record<string, unknown>;
        const specUrl = record.clarity_url as string;
        const modelUrl =
          typeof record.model_url === 'string'
            ? record.model_url
            : `/models/${slug}/model.onnx`;
        return { specUrl, modelUrl };
      }
    }
  } catch {
    // API route not present — fall through to manifest
  }

  // Attempt 2 — static manifest
  try {
    const manifestRes = await fetch('/models/manifest.json', { cache: 'no-cache' });
    if (manifestRes.ok) {
      const manifest: unknown = await manifestRes.json();
      if (
        typeof manifest === 'object' &&
        manifest !== null &&
        'models' in manifest
      ) {
        const models = (manifest as Record<string, unknown>).models;
        if (
          typeof models === 'object' &&
          models !== null &&
          slug in models
        ) {
          const entry = (models as Record<string, unknown>)[slug];
          if (
            typeof entry === 'object' &&
            entry !== null &&
            'spec_url' in entry &&
            'url' in entry
          ) {
            const e = entry as Record<string, unknown>;
            if (typeof e.spec_url === 'string' && typeof e.url === 'string') {
              return { specUrl: e.spec_url, modelUrl: e.url };
            }
          }
        }
      }
    }
  } catch {
    // Manifest not readable — fall through to synthesised paths
  }

  // Attempt 3 — synthesise local paths
  return {
    specUrl: `/models/${slug}/clarity.json`,
    modelUrl: `/models/${slug}/model.onnx`,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClarityRay(): UseClarityRayReturn {
  const [status, setStatus] = useState<ClarityRayStatus>('idle');
  const [result, setResult] = useState<SafeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);

  // The active spec and session refs let runAnalysis access current values
  // without needing them in its dependency array.
  const specRef = useRef<ClaritySpec | null>(null);
  const statusRef = useRef<ClarityRayStatus>('idle');

  // Keep statusRef in sync with status state.
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ── addLog ────────────────────────────────────────────────────────────────
  // Never throws. Appends to the immutable log array.
  const addLog = useCallback((level: SystemLog['level'], message: string) => {
    try {
      setLogs((prev) => [...prev, makeLog(level, message)]);
    } catch {
      // Swallow — logging must never break the application.
    }
  }, []);

  // ── Mount lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Step 1-2: loading_manifest
        setStatus('loading_manifest');
        addLog('info', 'Initializing ClarityRay system...');

        // Step 3: read selected slug
        const slug =
          (typeof window !== 'undefined' &&
            localStorage.getItem(SELECTED_MODEL_KEY)) ||
          DEFAULT_SLUG;

        // Step 4: resolve spec + model URLs
        let specUrl: string;
        let modelUrl: string;
        try {
          ({ specUrl, modelUrl } = await resolveModelUrls(slug));
        } catch {
          if (cancelled) return;
          const msg = 'Failed to load model registry.';
          setStatus('error');
          setError(msg);
          addLog('error', msg);
          return;
        }

        if (cancelled) return;

        // Steps 5-7: loading_spec
        setStatus('loading_spec');
        addLog('info', 'Loading model specification...');

        let spec: ClaritySpec;
        try {
          const specRes = await fetch(specUrl);
          if (!specRes.ok) {
            throw new Error(`HTTP ${specRes.status} ${specRes.statusText}`);
          }
          const specJson: unknown = await specRes.json();
          spec = validateSpec(specJson);
        } catch (err) {
          if (cancelled) return;
          const msg = `Model specification invalid: ${plainError(err)}`;
          setStatus('error');
          setError(msg);
          addLog('error', msg);
          return;
        }

        if (cancelled) return;

        // Step 8-9: set modelInfo from spec
        setModelInfo(modelInfoFromSpec(spec));
        specRef.current = spec;
        addLog('info', `Spec loaded: ${spec.id} v${spec.version}`);

        // Check if session already cached — skip download if so
        const cachedSession = sessionCache.get(spec.id);
        if (cachedSession) {
          addLog('info', 'Using cached inference session.');
          setStatus('ready');
          addLog('success', 'System ready — awaiting scan');
          return;
        }

        // Steps 10-15: downloading_model
        setStatus('downloading_model');
        addLog('info', 'Checking local model cache...');

        let modelBuffer: ArrayBuffer;
        let integritySkipped: boolean;
        try {
          ({ buffer: modelBuffer, integritySkipped } = await loadModel(modelUrl, spec));
        } catch (err) {
          if (cancelled) return;
          const msg = `Model download failed: ${plainError(err)}`;
          setStatus('error');
          setError(msg);
          addLog('error', msg);
          return;
        }

        if (cancelled) return;

        // Steps 16-18: verifying_model
        setStatus('verifying_model');
        addLog('info', 'Verifying model...');

        if (integritySkipped) {
          addLog('warn', 'Integrity check skipped — hash not in spec');
        } else {
          addLog('info', 'Model integrity verified.');
        }

        // Create ONNX InferenceSession
        let session: ort.InferenceSession;
        try {
          session = await ort.InferenceSession.create(modelBuffer);
          sessionCache.set(spec.id, session);
        } catch (err) {
          if (cancelled) return;
          const msg = `Failed to initialize inference session: ${plainError(err)}`;
          setStatus('error');
          setError(msg);
          addLog('error', msg);
          return;
        }

        if (cancelled) return;

        // Steps 19-20: ready
        setStatus('ready');
        addLog('success', 'System ready — awaiting scan');
      } catch (err) {
        if (cancelled) return;
        const msg = plainError(err);
        setStatus('error');
        setError(msg);
        addLog('error', msg);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── runAnalysis ───────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async (file: File): Promise<void> => {
    // Guard: only run when ready
    if (statusRef.current !== 'ready') return;

    const spec = specRef.current;
    if (!spec) return;

    const session = sessionCache.get(spec.id);
    if (!session) return;

    try {
      // Step 1-3
      setStatus('processing');
      setResult(null);
      setError(null);
      addLog('info', `Analysis started: ${file.name}`);

      // Step 4-5: preprocess
      const tensor = await preprocessImage(file, spec);
      addLog('info', 'Image preprocessed');

      // Step 6-7: inference
      const inputShape = spec.input.shape;
      const ortTensor = new ort.Tensor('float32', tensor, inputShape);

      // Determine input/output node names
      const inputName = session.inputNames[0] ?? 'input';
      const outputs = await session.run({ [inputName]: ortTensor });

      const outputName = session.outputNames[0] ?? 'output';
      const outputTensor = outputs[outputName];
      if (!outputTensor) {
        throw new Error('Model run returned no output tensor.');
      }

      const rawOutput =
        outputTensor.data instanceof Float32Array
          ? outputTensor.data
          : Float32Array.from(outputTensor.data as ArrayLike<number>);

      addLog('info', 'Inference complete');

      // Step 8: postprocess
      const safeResult = postprocess(rawOutput, spec);

      // Steps 9-11: complete
      setResult(safeResult);
      setStatus('complete');
      addLog(
        'success',
        `Finding: ${safeResult.primaryFinding} (${safeResult.confidencePercent}%)`,
      );
    } catch (err) {
      const msg = plainError(err);
      setStatus('error');
      setError(msg);
      addLog('error', msg);
    }
  }, [addLog]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    // Restore to ready if session cached, otherwise idle
    const spec = specRef.current;
    const hasSession = spec ? sessionCache.has(spec.id) : false;
    setStatus(hasSession ? 'ready' : 'idle');
    // Logs are append-only — never cleared
  }, []);

  return {
    status,
    result,
    error,
    modelInfo,
    logs,
    runAnalysis,
    reset,
  };
}
