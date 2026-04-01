import { modelConfig } from './config';

type InputSource = HTMLImageElement | HTMLCanvasElement;

const imagenetMean: [number, number, number] = [0.485, 0.456, 0.406];
const imagenetStd: [number, number, number] = [0.229, 0.224, 0.225];

export function preprocessImage(source: InputSource): Float32Array {
  const [targetWidth, targetHeight] = modelConfig.inputSize;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to get 2D context for preprocessing');
  }

  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);

  const pixelCount = targetWidth * targetHeight;
  const floatData = new Float32Array(1 * 3 * pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;

    floatData[i] = (r - imagenetMean[0]) / imagenetStd[0];
    floatData[i + pixelCount] = (g - imagenetMean[1]) / imagenetStd[1];
    floatData[i + pixelCount * 2] = (b - imagenetMean[2]) / imagenetStd[2];
  }

  return floatData;
}
