import type { ClaritySpec } from './types';
import type { HeatmapData } from './postprocess';
import { runInference } from './run';
import { postprocess } from './postprocess';

export interface OcclusionOptions {
  gridSize?: number;
  onProgress?: (progress: number) => void;
  abortSignal?: AbortSignal;
}

export async function generateOcclusionHeatmap(
  baselineTensor: Float32Array,
  spec: ClaritySpec,
  targetClassIndex: number,
  options: OcclusionOptions = {}
): Promise<HeatmapData> {
  const { gridSize = 12, onProgress, abortSignal } = options;

  const shape = spec.input.shape;
  const channels = shape[1] ?? 1;
  const H = shape[2] ?? 224;
  const W = shape[3] ?? 224;

  const totalIterations = gridSize * gridSize;

  if (abortSignal?.aborted) {
    throw new Error('Occlusion sensitivity run aborted');
  }

  const baselineOutput = await runInference(baselineTensor, spec);
  const baselineResult = postprocess(baselineOutput, spec);
  const targetLabel = spec.output.classes[targetClassIndex];
  if (!targetLabel) {
    throw new Error(`Target class index ${targetClassIndex} is invalid.`);
  }

  const baselineConfidence = baselineResult.classProbabilities.find(
    (p) => p.label === targetLabel
  )?.probability ?? 0;

  // Create a 2D grid to store importance scores
  const grid: number[][] = Array.from({ length: gridSize }, () =>
    new Array(gridSize).fill(0)
  );

  // Iterate over grid
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (abortSignal?.aborted) {
        throw new Error('Occlusion sensitivity run aborted');
      }

      // Compute patch pixel boundaries
      const startH = Math.round((r * H) / gridSize);
      const endH = Math.round(((r + 1) * H) / gridSize);
      const startW = Math.round((c * W) / gridSize);
      const endW = Math.round(((c + 1) * W) / gridSize);

      // Create a masked copy of the baseline tensor
      const maskedTensor = baselineTensor.slice();
      for (let ch = 0; ch < channels; ch++) {
        const channelOffset = ch * H * W;
        for (let y = startH; y < endH; y++) {
          const rowOffset = y * W;
          for (let x = startW; x < endW; x++) {
            maskedTensor[channelOffset + rowOffset + x] = 0;
          }
        }
      }

      // Run inference on masked tensor
      const maskedOutput = await runInference(maskedTensor, spec);
      const maskedResult = postprocess(maskedOutput, spec);
      const maskedConfidence = maskedResult.classProbabilities.find(
        (p) => p.label === targetLabel
      )?.probability ?? 0;

      // Drop in confidence measures importance
      const importance = Math.max(0, baselineConfidence - maskedConfidence);
      grid[r][c] = importance;

      // Update progress
      const progress = Math.round(((r * gridSize + c + 1) / totalIterations) * 100);
      onProgress?.(progress);
    }
  }

  // Bilinear interpolate grid to H x W
  let values = interpolateBilinear(grid, H, W);

  // Smooth the upscaled heatmap values using a 5x5 box blur
  values = smoothHeatmap(values, W, H);

  // Normalize values to [0, 1]
  normalizeInPlace(values);

  return {
    values,
    width: W,
    height: H,
    method: 'occlusion_sensitivity',
  };
}

function interpolateBilinear(grid: number[][], H: number, W: number): Float32Array {
  const gridRows = grid.length;
  const gridCols = grid[0].length;
  const values = new Float32Array(H * W);

  for (let y = 0; y < H; y++) {
    const gy = (y + 0.5) * (gridRows / H) - 0.5;
    const y0 = Math.max(0, Math.floor(gy));
    const y1 = Math.min(gridRows - 1, y0 + 1);
    const weightY = gy - y0;

    for (let x = 0; x < W; x++) {
      const gx = (x + 0.5) * (gridCols / W) - 0.5;
      const x0 = Math.max(0, Math.floor(gx));
      const x1 = Math.min(gridCols - 1, x0 + 1);
      const weightX = gx - x0;

      const v00 = grid[y0][x0];
      const v01 = grid[y0][x1];
      const v10 = grid[y1][x0];
      const v11 = grid[y1][x1];

      const val =
        (1 - weightY) * ((1 - weightX) * v00 + weightX * v01) +
        weightY * ((1 - weightX) * v10 + weightX * v11);

      values[y * W + x] = val;
    }
  }

  return values;
}

function smoothHeatmap(input: Float32Array, width: number, height: number): Float32Array {
  const output = new Float32Array(input.length);
  const size = 2; // radius of 2 for 5x5 blur

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let ky = -size; ky <= size; ky++) {
        for (let kx = -size; kx <= size; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            sum += input[ny * width + nx];
            count++;
          }
        }
      }
      output[y * width + x] = count > 0 ? sum / count : 0;
    }
  }
  return output;
}

function normalizeInPlace(values: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
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
