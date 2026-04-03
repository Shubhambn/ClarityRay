import type { ClaritySpec } from "./types";
import { translateResults, type SafeResult } from "../models/chestXray/postprocess";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function softmax(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const maxValue = Math.max(...values);
  const expValues = values.map((value) => Math.exp(value - maxValue));
  const sum = expValues.reduce((acc, value) => acc + value, 0);

  assert(Number.isFinite(sum) && sum > 0, "Invalid softmax denominator.");

  return expValues.map((value) => value / sum);
}

function applyActivation(values: number[], activation: ClaritySpec["output"]["activation"]): number[] {
  if (activation === "softmax") {
    return softmax(values);
  }

  if (activation === "sigmoid") {
    return values.map(sigmoid);
  }

  return values;
}

function validateProbabilityRange(values: number[]): void {
  values.forEach((value, index) => {
    assert(Number.isFinite(value), `Probability at index ${index} is not finite.`);
    assert(value >= 0 && value <= 1, `Probability at index ${index} is ${value}; expected a value in [0, 1].`);
  });
}

export function toProbabilities(
  rawOutput: Float32Array,
  spec: ClaritySpec
): number[] {
  assert(rawOutput instanceof Float32Array, "postprocess expected rawOutput to be a Float32Array.");

  const values = Array.from(rawOutput);
  const classCount = spec.output.classes.length;

  assert(classCount > 0, "spec.output.classes must contain at least one class.");
  assert(
    values.length === classCount,
    `rawOutput length mismatch: got ${values.length}, expected ${classCount} values to match spec.output.classes.`
  );

  const probabilities = applyActivation(values, spec.output.activation);
  validateProbabilityRange(probabilities);

  return probabilities;
}

export function postprocess(
  rawOutput: Float32Array,
  spec: ClaritySpec
): SafeResult {
  const probabilities = toProbabilities(rawOutput, spec);

  return translateResults(probabilities, spec.output.classes);
}
