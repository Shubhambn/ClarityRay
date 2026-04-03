// LEGACY ONLY: reference code path, not used by active runtime.
import { modelConfig } from './config';

type InputSource = HTMLImageElement | HTMLCanvasElement;

export type HeatmapData = {
  values: Float32Array;
  width: number;
  height: number;
  method: 'contrast_attention_v1';
};

function normalizeInPlace(values: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    values.fill(0);
    return;
  }

  for (let i = 0; i < values.length; i++) {
    values[i] = (values[i] - min) / range;
  }
}

function smooth3x3(input: Float32Array, width: number, height: number): Float32Array {
  const output = new Float32Array(input.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          sum += input[ny * width + nx] ?? 0;
          count += 1;
        }
      }

      output[y * width + x] = count > 0 ? sum / count : 0;
    }
  }

  return output;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function generateHeatmap(source: InputSource, abnormalConfidence: number): HeatmapData {
  const [width, height] = modelConfig.inputSize;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to get 2D context for heatmap generation');
  }

  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const luminance = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const response = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      const left = luminance[idx - 1] ?? 0;
      const right = luminance[idx + 1] ?? 0;
      const up = luminance[idx - width] ?? 0;
      const down = luminance[idx + width] ?? 0;

      const gx = Math.abs(right - left);
      const gy = Math.abs(down - up);
      const contrast = clamp01((gx + gy) * 1.5);

      const intensity = clamp01(((luminance[idx] ?? 0) - 0.35) / 0.45);

      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const centerX = (nx - 0.5) / 0.35;
      const centerY = (ny - 0.5) / 0.45;
      const centerPrior = Math.exp(-(centerX * centerX + centerY * centerY));

      response[idx] = 0.55 * contrast + 0.25 * intensity + 0.2 * centerPrior;
    }
  }

  const smoothed = smooth3x3(response, width, height);
  normalizeInPlace(smoothed);

  const confidenceScale = 0.45 + 0.55 * clamp01(abnormalConfidence);
  for (let i = 0; i < smoothed.length; i++) {
    smoothed[i] = Math.pow(smoothed[i], 1.15) * confidenceScale;
  }

  normalizeInPlace(smoothed);

  return {
    values: smoothed,
    width,
    height,
    method: 'contrast_attention_v1'
  };
}
