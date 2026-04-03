import { useCallback, useEffect, useRef, useState } from 'react';
import type { HeatmapData } from '@/lib/models/chestXray/heatmap';
import { generateHeatmap } from '@/lib/models/chestXray/heatmap';
import type { ClarityRayResult } from '@/lib/models/chestXray/postprocess';
import type { ClaritySpec } from '@/lib/clarity/types';
import { preprocessImage } from '@/lib/clarity/preprocess';
import { runInference, sessionCache } from '@/lib/clarity/run';
import { postprocess, toProbabilities } from '@/lib/clarity/postprocess';

type ClarityRayStatus =
  | 'idle'
  | 'loading_model'
  | 'preprocessing'
  | 'running'
  | 'complete'
  | 'error';

export type AnalysisStatus = ClarityRayStatus;

export type AnalysisState = {
  status: AnalysisStatus;
  loading: boolean;
  error: string | null;
  result: ClarityRayResult | null;
  imageUrl: string | null;
  heatmap: HeatmapData | null;
};

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      reject(new Error('Unsupported file type. Please use PNG or JPEG.'));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => reject(new Error('We could not read this image. Please try a different PNG or JPEG file.'));
    img.src = objectUrl;
  });
}

function getUserFriendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Unexpected error while running analysis.';

  if (/WebAssembly/i.test(message)) {
    return 'Your browser is not supported for local AI analysis. Please use a recent Chrome, Firefox, or Edge version.';
  }

  if (/load the AI model/i.test(message)) {
    return 'The AI model could not be loaded. Please refresh the page and try again.';
  }

  if (/Invalid image tensor shape/i.test(message)) {
    return 'The selected image format is not supported for analysis.';
  }

  return message;
}

export function useClarityRay(spec: ClaritySpec) {
  const imageUrlRef = useRef<string | null>(null);

  const [state, setState] = useState<AnalysisState>({
    status: 'idle',
    loading: false,
    error: null,
    result: null,
    imageUrl: null,
    heatmap: null
  });

  const runAnalysis = useCallback(
    async (file: File) => {
      if (!file) {
        setState((prev: AnalysisState) => ({
          ...prev,
          status: 'error',
          loading: false,
          error: 'Please select an image before running analysis.'
        }));
        return null;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setState((prev: AnalysisState) => ({
          ...prev,
          status: 'error',
          loading: false,
          error: 'File is too large. Please upload an image smaller than 10MB.'
        }));
        return null;
      }

      setState((prev: AnalysisState) => ({
        ...prev,
        status: 'idle',
        loading: true,
        error: null
      }));

      try {
        if (typeof window === 'undefined') {
          throw new Error('This analysis must run in a browser environment.');
        }

        if (!('WebAssembly' in window)) {
          throw new Error('WebAssembly is not supported in this browser.');
        }

        if (!sessionCache.has(spec.id)) {
          setState((prev: AnalysisState) => ({ ...prev, status: 'loading_model' }));
        }

        setState((prev: AnalysisState) => ({ ...prev, status: 'preprocessing' }));

        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });

        const input = await preprocessImage(file, spec);

        setState((prev: AnalysisState) => ({ ...prev, status: 'running' }));

        const rawOutput = await runInference(input, spec);
        const safeResult = postprocess(rawOutput, spec);
        const probabilities = toProbabilities(rawOutput, spec);

        const findings: { label: string; confidence: number }[] = spec.output.classes
          .map((label, idx) => ({ label, confidence: probabilities[idx] ?? 0 }))
          .sort((a, b) => b.confidence - a.confidence);

        const result: ClarityRayResult = {
          primaryFinding: safeResult.primaryFinding,
          safetyTier: safeResult.safetyTier,
          findings,
          explanation: safeResult.plainSummary,
          disclaimer: safeResult.disclaimer
        };

        if (!result || result.findings.length === 0) {
          throw new Error('Analysis completed, but we could not interpret the output. Please try again.');
        }

    const image = await loadImageFromFile(file);
    const imageUrl = URL.createObjectURL(file);
    const normalClassIndex = spec.output.classes.findIndex((label) => /normal/i.test(label));
    const normalProbability = normalClassIndex >= 0 ? probabilities[normalClassIndex] ?? 0 : 0;
    const abnormalConfidence = Math.max(0, 1 - normalProbability);
        const heatmap = generateHeatmap(image, abnormalConfidence);

        if (imageUrlRef.current) {
          URL.revokeObjectURL(imageUrlRef.current);
        }
        imageUrlRef.current = imageUrl;

        setState({ status: 'complete', loading: false, error: null, result, imageUrl, heatmap });
        return result;
      } catch (err) {
        const message = getUserFriendlyError(err);
        setState((prev: AnalysisState) => ({
          ...prev,
          status: 'error',
          loading: false,
          error: message
        }));
        return null;
      }
    },
    [spec]
  );

  const reset = useCallback(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }

    setState({
      status: 'idle',
      loading: false,
      error: null,
      result: null,
      imageUrl: null,
      heatmap: null
    });
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    findings: state.result?.findings ?? [],
    heatmapCanvas: state.heatmap,
    disclaimer: state.result?.disclaimer ?? null,
    runAnalysis,
    reset
  };
}
