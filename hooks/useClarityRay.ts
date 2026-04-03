import { useCallback, useEffect, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';
import {
  generateHeatmap,
  postprocess,
  toProbabilities,
  type HeatmapData,
  type SafeResult
} from '@/lib/clarity/postprocess';
import type { ClaritySpec } from '@/lib/clarity/types';
import { preprocessImage } from '@/lib/clarity/preprocess';
import { runInference, sessionCache } from '@/lib/clarity/run';
import { fetchManifest, getCurrentModel } from '@/lib/clarity/manifest';
import { fetchSpec } from '@/lib/clarity/specLoader';
import { loadModel } from '@/lib/clarity/loader';

type ClarityRayStatus =
  | 'idle'
  | 'loading_manifest'
  | 'loading_spec'
  | 'downloading_model'
  | 'verifying_model'
  | 'ready'
  | 'processing'
  | 'error';

export type AnalysisStatus = ClarityRayStatus;

export type AnalysisState = {
  status: AnalysisStatus;
  loading: boolean;
  error: string | null;
  result: SafeResult | null;
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

  if (/Failed to fetch model/i.test(message)) {
    return 'Failed to load model. Please try again.';
  }

  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return 'Network error. Please check your connection and retry.';
  }

  if (/integrity check failed/i.test(message)) {
    return 'Model integrity check failed. Please reload.';
  }

  if (/Invalid image tensor shape/i.test(message)) {
    return 'The selected image format is not supported for analysis.';
  }

  return message;
}

export function useClarityRay(spec: ClaritySpec) {
  const imageUrlRef = useRef<string | null>(null);
  const [activeSpec, setActiveSpec] = useState<ClaritySpec>(spec);
  const [session, setSession] = useState<ort.InferenceSession | null>(null);

  const [state, setState] = useState<AnalysisState>({
    status: 'idle',
    loading: false,
    error: null,
    result: null,
    imageUrl: null,
    heatmap: null
  });

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        setState((prev: AnalysisState) => ({
          ...prev,
          status: 'loading_manifest',
          loading: true,
          error: null
        }));

        const manifest = await fetchManifest();
        const currentModel = getCurrentModel(manifest);
        const modelUrl = currentModel.url;
        const specUrl = currentModel.spec_url;

        setState((prev: AnalysisState) => ({ ...prev, status: 'loading_spec' }));
        const fetchedSpec = await fetchSpec(specUrl);

        setState((prev: AnalysisState) => ({ ...prev, status: 'downloading_model' }));
        const modelBuffer = await loadModel(modelUrl, fetchedSpec);

        setState((prev: AnalysisState) => ({ ...prev, status: 'verifying_model' }));
        const createdSession = await ort.InferenceSession.create(modelBuffer);

        if (!isMounted) {
          return;
        }

        setActiveSpec(fetchedSpec);
        setSession(createdSession);
        sessionCache.set(fetchedSpec.id, createdSession);
        setState((prev: AnalysisState) => ({
          ...prev,
          status: 'ready',
          loading: false,
          error: null
        }));
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setState((prev: AnalysisState) => ({
          ...prev,
          status: 'error',
          loading: false,
          error: getUserFriendlyError(err)
        }));
      }
    };

    void initializeSession();

    return () => {
      isMounted = false;
    };
  }, []);

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
        status: 'processing',
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

        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });

        const input = await preprocessImage(file, activeSpec);

        const rawOutput = await runInference(input, activeSpec);
        const safeResult: SafeResult = postprocess(rawOutput, activeSpec);
        const probabilities = toProbabilities(rawOutput, activeSpec);

        if (!safeResult || activeSpec.output.classes.length === 0) {
          throw new Error('Analysis completed, but we could not interpret the output. Please try again.');
        }

    const image = await loadImageFromFile(file);
    const imageUrl = URL.createObjectURL(file);
    const normalClassIndex = activeSpec.output.classes.findIndex((label) => /normal/i.test(label));
    const normalProbability = normalClassIndex >= 0 ? probabilities[normalClassIndex] ?? 0 : 0;
    const abnormalConfidence = Math.max(0, 1 - normalProbability);
        const heatmap = generateHeatmap(image, abnormalConfidence);

        if (imageUrlRef.current) {
          URL.revokeObjectURL(imageUrlRef.current);
        }
        imageUrlRef.current = imageUrl;

        setState({ status: 'ready', loading: false, error: null, result: safeResult, imageUrl, heatmap });
        return safeResult;
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
    [activeSpec, session]
  );

  const reset = useCallback(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }

    setState({
      status: session || sessionCache.has(activeSpec.id) ? 'ready' : 'idle',
      loading: false,
      error: null,
      result: null,
      imageUrl: null,
      heatmap: null
    });
  }, [activeSpec.id, session]);

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
    heatmapCanvas: state.heatmap,
    disclaimer: state.result?.disclaimer ?? null,
    runAnalysis,
    reset
  };
}
