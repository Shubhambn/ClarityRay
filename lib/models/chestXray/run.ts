import * as ort from 'onnxruntime-web';
import { modelConfig } from './config';

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function assertBrowserSupport() {
  if (typeof window === 'undefined') {
    throw new Error('This analysis must run in a browser environment.');
  }

  if (!('WebAssembly' in window)) {
    throw new Error('This browser does not support WebAssembly. Please use a modern browser.');
  }
}

async function getSession(): Promise<ort.InferenceSession> {
  assertBrowserSupport();

  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(modelConfig.modelPath, {
      executionProviders: ['wasm']
    });
  }

  try {
    return await sessionPromise;
  } catch {
    sessionPromise = null;
    throw new Error('Unable to load the AI model in your browser. Please refresh and try again.');
  }
}

export async function ensureModelLoaded(): Promise<void> {
  await getSession();
}

export async function runModel(input: Float32Array): Promise<Float32Array> {
  assertBrowserSupport();

  if (!(input instanceof Float32Array)) {
    throw new Error('Invalid model input format.');
  }

  const [width, height] = modelConfig.inputSize;
  const expectedLength = 1 * 3 * width * height;

  if (input.length !== expectedLength) {
    throw new Error('Invalid image tensor shape. Expected [1, 3, 224, 224].');
  }

  const inputTensor = new ort.Tensor('float32', input, [1, 3, height, width]);
  const currentSession = await getSession();
  const inputName = currentSession.inputNames[0];
  const outputName = currentSession.outputNames[0];

  if (!inputName) {
    throw new Error('Model input name not found.');
  }

  if (!outputName) {
    throw new Error('Model output name not found.');
  }

  const outputs = await currentSession.run({ [inputName]: inputTensor });
  const outputTensor = outputs[outputName] ?? outputs[Object.keys(outputs)[0]];

  if (!outputTensor?.data) {
    throw new Error('Model produced no output.');
  }

  if (outputTensor.data instanceof Float32Array) {
    return outputTensor.data;
  }

  return Float32Array.from(outputTensor.data as ArrayLike<number>);
}
