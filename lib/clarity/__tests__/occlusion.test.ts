// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateOcclusionHeatmap } from '../occlusion';
import type { ClaritySpec } from '../types';
import { runInference } from '../run';
import { postprocess } from '../postprocess';

vi.mock('../run', () => ({
  runInference: vi.fn(),
}));

vi.mock('../postprocess', () => ({
  postprocess: vi.fn(),
}));

const mockSpec: ClaritySpec = {
  id: 'test-model',
  name: 'Test Model',
  version: '1.0.0',
  certified: false,
  bodypart: 'chest',
  modality: 'xray',
  model: { file: 'model.onnx' },
  input: {
    shape: [1, 1, 4, 4],
    normalize: { mean: [0.5], std: [0.5] },
  },
  output: {
    classes: ['Normal', 'Lung Cancer'],
    activation: 'softmax',
  },
  safety: { tier: 'screening', disclaimer: 'Test' },
  thresholds: { possible_finding: 0.5, low_confidence: 0.25, validation_status: 'unvalidated' },
};

describe('Occlusion Sensitivity Explainability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs occlusion sensitivity and returns HeatmapData', async () => {
    const inputTensor = new Float32Array(16).fill(0.5);

    let callCount = 0;
    vi.mocked(runInference).mockImplementation(async () => {
      return new Float32Array([0.0, 1.0]);
    });

    vi.mocked(postprocess).mockImplementation(() => {
      callCount++;
      const probability = callCount === 1 ? 0.8 : 0.4;
      return {
        primaryFinding: 'Lung Cancer',
        confidencePercent: probability * 100,
        safetyTier: 'possible_finding',
        plainSummary: 'plain',
        disclaimer: 'disclaimer',
        classProbabilities: [
          { label: 'Normal', probability: 1 - probability },
          { label: 'Lung Cancer', probability },
        ],
      };
    });

    const progressCalls: number[] = [];
    const onProgress = (p: number) => {
      progressCalls.push(p);
    };

    const heatmap = await generateOcclusionHeatmap(inputTensor, mockSpec, 1, {
      gridSize: 2,
      onProgress,
    });

    expect(runInference).toHaveBeenCalledTimes(5);
    expect(postprocess).toHaveBeenCalledTimes(5);

    expect(heatmap.method).toBe('occlusion_sensitivity');
    expect(heatmap.width).toBe(4);
    expect(heatmap.height).toBe(4);
    expect(heatmap.values.length).toBe(16);

    expect(progressCalls.length).toBe(4);
    expect(progressCalls[0]).toBe(25);
    expect(progressCalls[3]).toBe(100);

    for (const val of heatmap.values) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('aborts execution when AbortSignal is triggered', async () => {
    const inputTensor = new Float32Array(16).fill(0.5);
    const controller = new AbortController();

    vi.mocked(runInference).mockImplementation(async () => {
      return new Float32Array([0.0, 1.0]);
    });

    vi.mocked(postprocess).mockImplementation(() => {
      return {
        primaryFinding: 'Lung Cancer',
        confidencePercent: 80,
        safetyTier: 'possible_finding',
        plainSummary: 'plain',
        disclaimer: 'disclaimer',
        classProbabilities: [
          { label: 'Normal', probability: 0.2 },
          { label: 'Lung Cancer', probability: 0.8 },
        ],
      };
    });

    controller.abort();

    await expect(
      generateOcclusionHeatmap(inputTensor, mockSpec, 1, {
        gridSize: 2,
        abortSignal: controller.signal,
      })
    ).rejects.toThrow('Occlusion sensitivity run aborted');
  });
});
