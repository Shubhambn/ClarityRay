import type { ClaritySpec } from "./types";

const RGBA_CHANNELS = 4;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeFileToImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image file."));
    };

    img.src = objectUrl;
  });
}

async function decodeImage(file: File): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to HTMLImageElement decode path.
    }
  }

  return decodeFileToImageElement(file);
}

function getResizedImageData(source: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to get 2D context for preprocessing.");
  }

  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function getRgb01(data: Uint8ClampedArray, pixelIndex: number): [number, number, number] {
  const offset = pixelIndex * RGBA_CHANNELS;
  return [data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255];
}

function rgbToGray01(r: number, g: number, b: number): number {
  // ITU-R BT.601 luma transform.
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export async function preprocessImage(
  file: File,
  spec: ClaritySpec
): Promise<Float32Array> {
  const shape = spec.input.shape;
  assert(shape.length === 4, `Expected spec.input.shape to be [batch, channels, height, width], got length ${shape.length}.`);

  const [batch, channels, height, width] = shape;
  assert(Number.isInteger(batch) && batch > 0, "spec.input.shape[0] (batch) must be a positive integer.");
  assert(Number.isInteger(channels) && channels > 0, "spec.input.shape[1] (channels) must be a positive integer.");
  assert(Number.isInteger(height) && height > 0, "spec.input.shape[2] (height) must be a positive integer.");
  assert(Number.isInteger(width) && width > 0, "spec.input.shape[3] (width) must be a positive integer.");
  assert(batch === 1, `NCHW preprocessing currently requires batch=1, got batch=${batch}.`);

  const expectedLength = shape.reduce((a, b) => a * b, 1);
  const pixelCount = height * width;

  const image = await decodeImage(file);
  const rgba = getResizedImageData(image, width, height);
  const output = new Float32Array(expectedLength);

  const normalize: unknown = spec.input.normalize;

  if (normalize === "grayscale") {
    assert(channels === 1, `normalize='grayscale' requires channels=1, got channels=${channels}.`);

    for (let i = 0; i < pixelCount; i++) {
      const [r, g, b] = getRgb01(rgba, i);
      output[i] = rgbToGray01(r, g, b);
    }
  } else if (normalize === "none") {
    assert(channels === 1 || channels === 3, `normalize='none' supports channels 1 or 3, got channels=${channels}.`);

    for (let i = 0; i < pixelCount; i++) {
      const [r, g, b] = getRgb01(rgba, i);

      if (channels === 1) {
        output[i] = rgbToGray01(r, g, b);
      } else {
        output[i] = r;
        output[i + pixelCount] = g;
        output[i + pixelCount * 2] = b;
      }
    }
  } else {
    const normalization = normalize;
    assert(
      isRecord(normalization),
      "spec.input.normalize must be either 'grayscale', 'none', or an object with mean/std arrays."
    );

    const meanRaw = normalization.mean;
    const stdRaw = normalization.std;
    assert(Array.isArray(meanRaw), "spec.input.normalize.mean must be an array of numbers.");
    assert(Array.isArray(stdRaw), "spec.input.normalize.std must be an array of numbers.");
    assert(meanRaw.length === channels, `spec.input.normalize.mean length (${meanRaw.length}) must equal channels (${channels}).`);
    assert(stdRaw.length === channels, `spec.input.normalize.std length (${stdRaw.length}) must equal channels (${channels}).`);

    const mean = meanRaw.map((value, index) => {
      assert(typeof value === "number", `spec.input.normalize.mean[${index}] must be a number.`);
      return value;
    });

    const std = stdRaw.map((value, index) => {
      assert(typeof value === "number", `spec.input.normalize.std[${index}] must be a number.`);
      assert(value !== 0, `spec.input.normalize.std[${index}] must not be 0.`);
      return value;
    });

    assert(channels === 1 || channels === 3, `mean/std normalization supports channels 1 or 3, got channels=${channels}.`);

    for (let i = 0; i < pixelCount; i++) {
      const [r, g, b] = getRgb01(rgba, i);

      if (channels === 1) {
        const gray = rgbToGray01(r, g, b);
        output[i] = (gray - mean[0]) / std[0];
      } else {
        output[i] = (r - mean[0]) / std[0];
        output[i + pixelCount] = (g - mean[1]) / std[1];
        output[i + pixelCount * 2] = (b - mean[2]) / std[2];
      }
    }
  }

  assert(
    output.length === expectedLength,
    `Preprocess output length mismatch: got ${output.length}, expected ${expectedLength}.`
  );

  return output;
}
