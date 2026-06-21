import { describe, it, expect } from 'vitest'
import { applyActivation, toProbabilities, translateResults, postprocess } from '../postprocess'
import type { ClaritySpec } from '../types'

function makeSpec(overrides?: Partial<ClaritySpec>): ClaritySpec {
  return {
    id: 'test-model',
    name: 'Test Model',
    version: '1.0.0',
    certified: false,
    bodypart: 'chest',
    modality: 'xray',
    model: { file: 'model.onnx' },
    input: {
      shape: [1, 1, 224, 224],
      normalize: { mean: [0.5], std: [0.5] },
    },
    output: { classes: ['Normal', 'Abnormal'], activation: 'softmax' },
    safety: { tier: 'screening', disclaimer: 'Screening tool only.' },
    thresholds: { possible_finding: 0.5, low_confidence: 0.2, validation_status: 'unvalidated' },
    ...overrides,
  }
}

const THRESHOLDS: ClaritySpec['thresholds'] = {
  possible_finding: 0.5,
  low_confidence: 0.2,
  validation_status: 'unvalidated',
}

// ─── applyActivation ──────────────────────────────────────────────────────────

describe('applyActivation', () => {
  it('softmax output sums to 1', () => {
    const result = applyActivation([1, 2, 3], 'softmax')
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('softmax values are all in [0, 1]', () => {
    const result = applyActivation([10, -5, 0.1], 'softmax')
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('softmax on empty array returns empty array', () => {
    expect(applyActivation([], 'softmax')).toEqual([])
  })

  it('softmax preserves ordering (highest input → highest output)', () => {
    const result = applyActivation([1, 3, 2], 'softmax')
    expect(result[1]).toBeGreaterThan(result[2])
    expect(result[2]).toBeGreaterThan(result[0])
  })

  it('sigmoid maps 0 → 0.5', () => {
    const result = applyActivation([0], 'sigmoid')
    expect(result[0]).toBeCloseTo(0.5, 5)
  })

  it('sigmoid maps large positive → ~1', () => {
    const result = applyActivation([100], 'sigmoid')
    expect(result[0]).toBeCloseTo(1, 3)
  })

  it('sigmoid maps large negative → ~0', () => {
    const result = applyActivation([-100], 'sigmoid')
    expect(result[0]).toBeCloseTo(0, 3)
  })

  it('none returns values unchanged', () => {
    const values = [0.1, 0.5, 0.9]
    expect(applyActivation(values, 'none')).toEqual(values)
  })
})

// ─── toProbabilities ──────────────────────────────────────────────────────────

describe('toProbabilities', () => {
  it('converts Float32Array via softmax and returns valid probabilities', () => {
    const spec = makeSpec()
    const raw = new Float32Array([1, 2])
    const probs = toProbabilities(raw, spec)

    expect(probs).toHaveLength(2)
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    for (const p of probs) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('throws when rawOutput length mismatches class count', () => {
    const spec = makeSpec()
    expect(() => toProbabilities(new Float32Array([1, 2, 3]), spec)).toThrow(
      /length mismatch/
    )
  })

  it('throws when rawOutput is not a Float32Array', () => {
    const spec = makeSpec()
    expect(() =>
      toProbabilities([0.3, 0.7] as unknown as Float32Array, spec)
    ).toThrow()
  })

  it('throws when spec has zero classes', () => {
    const spec = makeSpec({
      output: { classes: [], activation: 'softmax' },
    })
    expect(() => toProbabilities(new Float32Array([]), spec)).toThrow(/at least one class/)
  })

  it('passes through sigmoid activation correctly', () => {
    const spec = makeSpec({
      output: { classes: ['A', 'B'], activation: 'sigmoid' },
    })
    const raw = new Float32Array([0, 0])
    const probs = toProbabilities(raw, spec)
    expect(probs[0]).toBeCloseTo(0.5, 5)
    expect(probs[1]).toBeCloseTo(0.5, 5)
  })
})

// ─── translateResults ─────────────────────────────────────────────────────────

describe('translateResults', () => {
  const CLASSES = ['Normal', 'Abnormal']

  it('returns possible_finding when abnormal prob >= pos threshold', () => {
    const result = translateResults([0.3, 0.7], CLASSES, THRESHOLDS)
    expect(result.safetyTier).toBe('possible_finding')
    expect(result.primaryFinding).toBe('Abnormal')
    expect(result.confidencePercent).toBe(70)
  })

  it('returns low_confidence when abnormal prob is between thresholds', () => {
    const result = translateResults([0.7, 0.3], CLASSES, THRESHOLDS)
    expect(result.safetyTier).toBe('low_confidence')
    expect(result.primaryFinding).toBe('Low-confidence suspicious pattern')
    expect(result.confidencePercent).toBe(30)
  })

  it('returns no_finding when abnormal prob < low threshold', () => {
    const result = translateResults([0.9, 0.1], CLASSES, THRESHOLDS)
    expect(result.safetyTier).toBe('no_finding')
    expect(result.primaryFinding).toBe('Normal')
    expect(result.confidencePercent).toBe(90)
  })

  it('classProbabilities maps all classes with correct values', () => {
    const result = translateResults([0.6, 0.4], CLASSES, THRESHOLDS)
    expect(result.classProbabilities).toEqual([
      { label: 'Normal', probability: 0.6 },
      { label: 'Abnormal', probability: 0.4 },
    ])
  })

  it('confidencePercent is rounded', () => {
    const result = translateResults([0.0, 0.555], CLASSES, THRESHOLDS)
    expect(result.confidencePercent).toBe(56)
  })

  it('disclaimer is a non-empty string on every tier', () => {
    for (const probs of [[0.3, 0.7], [0.7, 0.3], [0.9, 0.1]] as const) {
      const result = translateResults([...probs], CLASSES, THRESHOLDS)
      expect(typeof result.disclaimer).toBe('string')
      expect(result.disclaimer.length).toBeGreaterThan(0)
    }
  })

  it('throws when fewer than 2 classes provided', () => {
    expect(() => translateResults([0.5, 0.5], ['Only'], THRESHOLDS)).toThrow(/two classes/)
  })

  it('throws when fewer than 2 probabilities provided', () => {
    expect(() => translateResults([0.5], CLASSES, THRESHOLDS)).toThrow(
      /two probabilities/
    )
  })
})

// ─── postprocess (end-to-end) ─────────────────────────────────────────────────

describe('postprocess', () => {
  it('returns a SafeResult with all required fields', () => {
    const spec = makeSpec()
    const raw = new Float32Array([0.2, 0.8]) // after softmax, Abnormal still dominant
    const result = postprocess(raw, spec)

    expect(result.safetyTier).toBe('possible_finding')
    expect(result.confidencePercent).toBeGreaterThan(0)
    expect(result.classProbabilities).toHaveLength(2)
    expect(typeof result.primaryFinding).toBe('string')
    expect(typeof result.plainSummary).toBe('string')
    expect(typeof result.disclaimer).toBe('string')
  })

  it('no_finding tier when Normal class dominates', () => {
    const spec = makeSpec()
    const raw = new Float32Array([5, 0]) // after softmax, Normal completely dominates
    const result = postprocess(raw, spec)
    expect(result.safetyTier).toBe('no_finding')
  })
})
