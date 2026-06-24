import { expect, test } from '@playwright/test';

test('debug browser preprocessing and inference directly', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/analysis');

  // Let's run a script in browser to load ORT, load image, preprocess, and run session.
  const results = await page.evaluate(async () => {
    // 1. Load ONNX Runtime Web dynamically
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
    document.head.appendChild(script);
    await new Promise((resolve) => { script.onload = resolve; });
    const ort = (window as any).ort;

    // Helper to load image
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    };

    // Preprocessing logic from lib/clarity/preprocess.ts
    const getResizedImageData = (source: HTMLImageElement, width: number, height: number): Uint8ClampedArray => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d ctx');
      ctx.drawImage(source, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height).data;
    };

    const preprocess = (rgba: Uint8ClampedArray, width: number, height: number) => {
      const pixelCount = width * height;
      const output = new Float32Array(1 * 3 * width * height);
      const mean = [0.485, 0.456, 0.406];
      const std = [0.229, 0.224, 0.225];

      for (let i = 0; i < pixelCount; i++) {
        const offset = i * 4;
        const r = rgba[offset] / 255;
        const g = rgba[offset + 1] / 255;
        const b = rgba[offset + 2] / 255;

        output[i] = (r - mean[0]) / std[0];
        output[i + pixelCount] = (g - mean[1]) / std[1];
        output[i + pixelCount * 2] = (b - mean[2]) / std[2];
      }
      return output;
    };

    // Load model
    const session = await ort.InferenceSession.create('/models/densenet121-chest/model.onnx');

    const run = async (url: string) => {
      const img = await loadImage(url);
      const rgba = getResizedImageData(img, 224, 224);
      const tensorData = preprocess(rgba, 224, 224);
      
      const tensor = new ort.Tensor('float32', tensorData, [1, 3, 224, 224]);
      const outputs = await session.run({ input: tensor });
      const logits = Array.from(outputs.output.data as Float32Array);
      
      // softmax
      const max = Math.max(...logits);
      const exps = logits.map(x => Math.exp(x - max));
      const sum = exps.reduce((a, b) => a + b, 0);
      const probs = exps.map(x => x / sum);

      return {
        firstPixels: Array.from(tensorData.slice(0, 5)),
        logits,
        probs
      };
    };

    const normalRes = await run('/normal_chest_xray.png');
    const cancerRes = await run('/cancer_chest_xray.png');

    return { normalRes, cancerRes };
  });

  console.log('--- DIRECT BROWSER PREPROCESS & INFERENCE RESULTS ---');
  console.log('Normal image:', JSON.stringify(results.normalRes, null, 2));
  console.log('Cancer image:', JSON.stringify(results.cancerRes, null, 2));
});
