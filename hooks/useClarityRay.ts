import { useCallback, useEffect, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web';
import type { HeatmapData } from '@/lib/models/chestXray/heatmap';
import { generateHeatmap } from '@/lib/models/chestXray/heatmap';
import { modelConfig } from '@/lib/models/chestXray/config';
import { preprocessImage } from '@/lib/models/chestXray/preprocess';
import { postprocessOutput, type ClarityRayResult } from '@/lib/models/chestXray/postprocess';

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
let cachedSession: ort.InferenceSession | null = null;

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

export function useClarityRay() {
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

        let session = cachedSession;

        if (!session) {
          setState((prev: AnalysisState) => ({ ...prev, status: 'loading_model' }));
          try {
            session = await ort.InferenceSession.create(modelConfig.modelPath, {
              executionProviders: ['wasm']
            });
            cachedSession = session;
          } catch {
            const message = 'We could not load the AI model in your browser. Please refresh and try again.';
            setState((prev: AnalysisState) => ({
              ...prev,
              status: 'error',
              loading: false,
              error: message
            }));
            return null;
          }
        }

        setState((prev: AnalysisState) => ({ ...prev, status: 'preprocessing' }));

        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });

        const image = await loadImageFromFile(file);
        const input = preprocessImage(image);

        setState((prev: AnalysisState) => ({ ...prev, status: 'running' }));

        const [width, height] = modelConfig.inputSize;
        const expectedLength = 1 * 3 * width * height;

        if (input.length !== expectedLength) {
          throw new Error('Invalid image tensor shape. Expected [1, 3, 224, 224].');
        }

        const inputName = session.inputNames[0];
        const outputName = session.outputNames[0];

        if (!inputName) {
          throw new Error('Model input name not found.');
        }

        if (!outputName) {
          throw new Error('Model output name not found.');
        }

        const inputTensor = new ort.Tensor('float32', input, [1, 3, height, width]);
        const outputs = await session.run({ [inputName]: inputTensor });
        const outputTensor = outputs[outputName] ?? outputs[Object.keys(outputs)[0]];

        if (!outputTensor?.data) {
          throw new Error('Model produced no output.');
        }

        const output =
          outputTensor.data instanceof Float32Array
            ? outputTensor.data
            : Float32Array.from(outputTensor.data as ArrayLike<number>);

        const result = postprocessOutput(output);

        if (!result || result.findings.length === 0) {
          throw new Error('Analysis completed, but we could not interpret the output. Please try again.');
        }

        const imageUrl = URL.createObjectURL(file);
        const abnormalConfidence = result.findings.find((finding) => finding.label === 'Lung Cancer')?.confidence ?? 0;
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
    []
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
