import * as ort from "onnxruntime-web";

import type { ClaritySpec } from "./types";

const sessionCache = new Map<string, ort.InferenceSession>();

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getModelNodeName(
  model: ClaritySpec["model"],
  key: "inputName" | "outputName"
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(model, key)) {
    return undefined;
  }

  const value: unknown = Reflect.get(model, key);
  if (typeof value !== "string") {
    return undefined;
  }

  return value.length > 0 ? value : undefined;
}

function getExpectedLength(shape: number[]): number {
  return shape.reduce((a, b) => a * b, 1);
}

function getModelFileName(file: string): string {
  const trimmed = file.trim();
  assert(trimmed.length > 0, "spec.model.file must be a non-empty string.");

  const withoutQueryOrHash = trimmed.split(/[?#]/, 1)[0] ?? "";
  const segments = withoutQueryOrHash.split("/").filter((segment) => segment.length > 0);
  const fileName = segments[segments.length - 1] ?? "";

  assert(fileName.length > 0, "spec.model.file must contain a filename.");
  return fileName;
}

export async function runInference(
  imageData: Float32Array,
  spec: ClaritySpec
): Promise<Float32Array> {
  assert(imageData instanceof Float32Array, "runInference expected imageData to be a Float32Array.");

  const shape = spec.input.shape;
  assert(shape.length > 0, "spec.input.shape must be a non-empty array.");

  const expectedLength = getExpectedLength(shape);
  assert(
    imageData.length === expectedLength,
    `imageData length mismatch: got ${imageData.length}, expected ${expectedLength}.`
  );

  let session = sessionCache.get(spec.id);

  if (!session) {
    const modelFile = getModelFileName(spec.model.file);
    const modelPath = `/models/${spec.id}/${modelFile}`;
    session = await ort.InferenceSession.create(modelPath);
    sessionCache.set(spec.id, session);
  }

  const tensor = new ort.Tensor("float32", imageData, shape);
  const inputName = getModelNodeName(spec.model, "inputName") ?? "input";

  const outputs = await session.run({ [inputName]: tensor });

  const preferredOutputName = getModelNodeName(spec.model, "outputName") ?? "output";
  const fallbackOutputName = Object.keys(outputs)[0];
  const outputNameToUse = outputs[preferredOutputName] ? preferredOutputName : fallbackOutputName;

  assert(outputNameToUse !== undefined, "Model run returned no output tensors.");

  const outputTensor = outputs[outputNameToUse];
  assert(outputTensor !== undefined, `Model output tensor '${outputNameToUse}' was not found.`);

  const outputData = outputTensor.data;

  if (outputData instanceof Float32Array) {
    return outputData;
  }

  return Float32Array.from(outputData as ArrayLike<number>);
}

export { sessionCache };
