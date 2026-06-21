import { describe, it, expect } from 'vitest'
import {
  applyActivation,
  toProbabilities,
  toRawValues,
  translateResults,
  interpretMultilabel,
  interpretMulticlass,
  interpretRegression,
  interpretSegmentation,
  interpretDetection,
  postprocess,
} from '../postprocess'
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

  it('dispatches binary by default (no task field)', () => {
    const spec = makeSpec()
    const result = postprocess(new Float32Array([0.2, 0.8]), spec)
    // binary path returns today's translateResults shape — no `task` tag
    expect(result.task).toBeUndefined()
  })
})

// ─── toRawValues (regression input path) ───────────────────────────────────────

describe('toRawValues', () => {
  it('returns raw values outside [0,1] without clamping (activation none)', () => {
    const spec = makeSpec({
      output: { task: 'regression', classes: ['Bone age'], activation: 'none' },
    })
    const values = toRawValues(new Float32Array([12.5]), spec)
    expect(values).toEqual([12.5])
  })

  it('keeps ALL outputs — the bug the binary path had', () => {
    const spec = makeSpec({
      output: { task: 'regression', classes: ['CTR', 'Spine angle'], activation: 'none' },
    })
    const values = toRawValues(new Float32Array([0.55, 27.3]), spec)
    expect(values).toHaveLength(2)
    expect(values[0]).toBeCloseTo(0.55, 5)
    expect(values[1]).toBeCloseTo(27.3, 3)
  })

  it('throws when a value is not finite', () => {
    const spec = makeSpec({
      output: { task: 'regression', classes: ['x'], activation: 'none' },
    })
    expect(() => toRawValues(new Float32Array([NaN]), spec)).toThrow(/not finite/)
  })

  it('throws on length/class mismatch', () => {
    const spec = makeSpec({
      output: { task: 'regression', classes: ['x'], activation: 'none' },
    })
    expect(() => toRawValues(new Float32Array([1, 2]), spec)).toThrow(/length mismatch/)
  })
})

// ─── interpretMultilabel ───────────────────────────────────────────────────────

describe('interpretMultilabel', () => {
  function mlSpec(overrides?: Partial<ClaritySpec['output']>): ClaritySpec {
    return makeSpec({
      output: {
        task: 'multilabel',
        activation: 'sigmoid',
        classes: ['Atelectasis', 'Cardiomegaly', 'Mass', 'Nodule'],
        labels: [
          { name: 'Mass', threshold: 0.5, suspicious: true },
          { name: 'Nodule', threshold: 0.5, suspicious: true },
          { name: 'Cardiomegaly', threshold: 0.5, suspicious: true },
          { name: 'Atelectasis', threshold: 0.5, suspicious: true },
        ],
        ...overrides,
      },
      thresholds: { low_confidence: 0.2, validation_status: 'unvalidated' },
    })
  }

  it('surfaces EVERY label at/over threshold, ranked by probability', () => {
    const spec = mlSpec()
    // Mass 0.9, Cardiomegaly 0.7 over; Atelectasis 0.1, Nodule 0.3 under
    const result = interpretMultilabel([0.1, 0.7, 0.9, 0.3], spec)
    expect(result.safetyTier).toBe('possible_finding')
    expect(result.findings?.map((f) => f.label)).toEqual(['Mass', 'Cardiomegaly'])
    expect(result.primaryFinding).toBe('Mass')
    expect(result.confidencePercent).toBe(90)
    expect(result.classProbabilities).toHaveLength(4)
  })

  it('does not discard the other 17 — full distribution always present', () => {
    const classes = Array.from({ length: 18 }, (_, i) => `Label${i}`)
    const spec = makeSpec({
      output: { task: 'multilabel', activation: 'sigmoid', classes },
      thresholds: { possible_finding: 0.5, low_confidence: 0.2, validation_status: 'unvalidated' },
    })
    const probs = classes.map((_, i) => (i === 4 ? 0.8 : 0.05))
    const result = interpretMultilabel(probs, spec)
    expect(result.classProbabilities).toHaveLength(18)
    expect(result.findings).toHaveLength(1)
    expect(result.findings?.[0].label).toBe('Label4')
  })

  it('low_confidence when a suspicious label is between low and its threshold', () => {
    const spec = mlSpec()
    const result = interpretMultilabel([0.1, 0.1, 0.35, 0.1], spec) // Mass 0.35 (>=0.2, <0.5)
    expect(result.safetyTier).toBe('low_confidence')
    expect(result.primaryFinding).toBe('Low-confidence: Mass')
  })

  it('no_finding when nothing crosses any threshold', () => {
    const spec = mlSpec()
    const result = interpretMultilabel([0.05, 0.05, 0.05, 0.05], spec)
    expect(result.safetyTier).toBe('no_finding')
    expect(result.findings).toHaveLength(0)
  })

  it('a non-suspicious label crossing threshold does not raise the tier', () => {
    const spec = mlSpec({
      classes: ['No Finding', 'Mass'],
      labels: [
        { name: 'No Finding', threshold: 0.5, suspicious: false },
        { name: 'Mass', threshold: 0.5, suspicious: true },
      ],
    })
    const result = interpretMultilabel([0.9, 0.1], spec)
    expect(result.safetyTier).toBe('no_finding')
    // still reported in findings (faithful), just not escalated
    expect(result.findings?.map((f) => f.label)).toEqual(['No Finding'])
  })

  it('defaults missing label metadata to suspicious + possible_finding threshold', () => {
    const spec = makeSpec({
      output: { task: 'multilabel', activation: 'sigmoid', classes: ['A', 'B'] },
      thresholds: { possible_finding: 0.5, low_confidence: 0.2, validation_status: 'unvalidated' },
    })
    const result = interpretMultilabel([0.6, 0.1], spec)
    expect(result.safetyTier).toBe('possible_finding')
    expect(result.primaryFinding).toBe('A')
  })
})

// ─── interpretMulticlass ───────────────────────────────────────────────────────

describe('interpretMulticlass', () => {
  function mcSpec(overrides?: Partial<ClaritySpec['output']>): ClaritySpec {
    return makeSpec({
      output: {
        task: 'multiclass',
        activation: 'softmax',
        classes: ['Normal', 'Pneumonia', 'Effusion'],
        labels: [
          { name: 'Normal', suspicious: false },
          { name: 'Pneumonia', suspicious: true },
          { name: 'Effusion', suspicious: true },
        ],
        ...overrides,
      },
      thresholds: { possible_finding: 0.5, low_confidence: 0.2, validation_status: 'unvalidated' },
    })
  }

  it('argmax picks the top class and returns the full distribution', () => {
    const spec = mcSpec()
    const result = interpretMulticlass([0.1, 0.7, 0.2], spec)
    expect(result.primaryFinding).toBe('Pneumonia')
    expect(result.safetyTier).toBe('possible_finding')
    expect(result.confidencePercent).toBe(70)
    expect(result.classProbabilities).toHaveLength(3)
  })

  it('benign winning class reads as no_finding', () => {
    const spec = mcSpec()
    const result = interpretMulticlass([0.8, 0.1, 0.1], spec)
    expect(result.primaryFinding).toBe('Normal')
    expect(result.safetyTier).toBe('no_finding')
    expect(result.findings).toHaveLength(0)
  })

  it('suspicious top class below threshold reads as low_confidence', () => {
    const spec = mcSpec()
    const result = interpretMulticlass([0.35, 0.4, 0.25], spec)
    expect(result.safetyTier).toBe('low_confidence')
    expect(result.primaryFinding).toBe('Low-confidence: Pneumonia')
  })
})

// ─── interpretRegression ───────────────────────────────────────────────────────

describe('interpretRegression', () => {
  it('reports the raw value, units and range', () => {
    const spec = makeSpec({
      output: {
        task: 'regression',
        activation: 'none',
        classes: ['Cardiothoracic ratio'],
        units: 'ratio',
        range: [0, 1],
      },
      thresholds: { validation_status: 'unvalidated' },
    })
    const result = interpretRegression([0.55], spec)
    expect(result.value).toBe(0.55)
    expect(result.units).toBe('ratio')
    expect(result.range).toEqual([0, 1])
    expect(result.primaryFinding).toContain('0.55')
  })

  it('carries multiple outputs through classProbabilities (none discarded)', () => {
    const spec = makeSpec({
      output: { task: 'regression', activation: 'none', classes: ['CTR', 'Angle'] },
      thresholds: { validation_status: 'unvalidated' },
    })
    const result = interpretRegression([0.55, 27.3], spec)
    expect(result.classProbabilities.map((c) => c.label)).toEqual(['CTR', 'Angle'])
    expect(result.classProbabilities[0].probability).toBeCloseTo(0.55, 5)
    expect(result.classProbabilities[1].probability).toBeCloseTo(27.3, 5)
  })

  it('applies severity banding when the value falls in a band', () => {
    const spec = makeSpec({
      output: {
        task: 'regression',
        activation: 'none',
        classes: ['CTR'],
        units: 'ratio',
        bands: [
          { max: 0.5, tier: 'no_finding', label: 'Normal' },
          { min: 0.5, tier: 'possible_finding', label: 'Cardiomegaly range' },
        ],
      },
      thresholds: { validation_status: 'unvalidated' },
    })
    const result = interpretRegression([0.6], spec)
    expect(result.safetyTier).toBe('possible_finding')
    expect(result.primaryFinding).toBe('Cardiomegaly range')
  })

  it('defaults to a neutral no_finding tier when no band matches', () => {
    const spec = makeSpec({
      output: { task: 'regression', activation: 'none', classes: ['Bone age'], units: 'years' },
      thresholds: { validation_status: 'unvalidated' },
    })
    const result = interpretRegression([12.5], spec)
    expect(result.safetyTier).toBe('no_finding')
    expect(result.value).toBe(12.5)
  })
})

// ─── postprocess dispatch (end-to-end per task) ────────────────────────────────

describe('postprocess dispatch', () => {
  it('routes multilabel through the multilabel interpreter', () => {
    const spec = makeSpec({
      output: { task: 'multilabel', activation: 'sigmoid', classes: ['A', 'B'] },
      thresholds: { possible_finding: 0.5, low_confidence: 0.2, validation_status: 'unvalidated' },
    })
    // sigmoid(2) ≈ 0.88 for A, sigmoid(-2) ≈ 0.12 for B
    const result = postprocess(new Float32Array([2, -2]), spec)
    expect(result.task).toBe('multilabel')
    expect(result.safetyTier).toBe('possible_finding')
    expect(result.primaryFinding).toBe('A')
  })

  it('routes regression through toRawValues (no [0,1] clamp)', () => {
    const spec = makeSpec({
      output: { task: 'regression', activation: 'none', classes: ['Bone age'], units: 'years' },
      thresholds: { validation_status: 'unvalidated' },
    })
    const result = postprocess(new Float32Array([12.5]), spec)
    expect(result.task).toBe('regression')
    expect(result.value).toBe(12.5)
  })

  it('routes segmentation through the segmentation interpreter', () => {
    const spec = makeSpec({
      output: { task: 'segmentation', activation: 'sigmoid', shape: [1, 1, 2, 2], classes: ['Lesion'] },
      thresholds: { validation_status: 'unvalidated' },
    })
    // sigmoid(5) ≈ 0.99 (>=0.5) for 3 of 4 pixels, sigmoid(-5) ≈ 0.01 for 1.
    const result = postprocess(new Float32Array([5, 5, 5, -5]), spec)
    expect(result.task).toBe('segmentation')
    expect(result.segmentation?.classes[0].coverage).toBeCloseTo(0.75)
  })

  it('routes detection through the detection interpreter', () => {
    const spec = makeSpec({
      output: {
        task: 'detection',
        activation: 'none',
        shape: [1, 1, 6],
        classes: ['Nodule'],
        detection: { box_format: 'xywh', max_detections: 1, score_threshold: 0.5 },
      },
      thresholds: { validation_status: 'unvalidated' },
    })
    const result = postprocess(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.9, 0]), spec)
    expect(result.task).toBe('detection')
    expect(result.detections).toHaveLength(1)
    expect(result.detections?.[0].label).toBe('Nodule')
  })
})

describe('interpretSegmentation', () => {
  function segSpec(overrides?: Partial<ClaritySpec['output']>): ClaritySpec {
    return makeSpec({
      output: {
        task: 'segmentation',
        activation: 'sigmoid',
        shape: [1, 2, 2, 2],
        classes: ['Lesion', 'Effusion'],
        ...overrides,
      },
      thresholds: { validation_status: 'unvalidated' },
    })
  }

  it('reports per-class coverage and a label map without discarding channels', () => {
    const spec = segSpec()
    // channel 0 (Lesion): all 4 pixels high; channel 1 (Effusion): all low.
    const result = interpretSegmentation([5, 5, 5, 5, -5, -5, -5, -5], spec)
    expect(result.segmentation?.classes[0].coverage).toBeCloseTo(1)
    expect(result.segmentation?.classes[1].coverage).toBeCloseTo(0)
    expect(result.segmentation?.labelMap).toHaveLength(4)
    expect(Array.from(result.segmentation!.labelMap)).toEqual([1, 1, 1, 1])
    expect(result.safetyTier).toBe('possible_finding')
    expect(result.primaryFinding).toBe('Lesion')
  })

  it('softmax assigns each pixel to its argmax channel', () => {
    const spec = segSpec({ activation: 'softmax' })
    // pixel order flattened per channel: ch0=[9,0,0,0], ch1=[0,9,9,9]
    const result = interpretSegmentation([9, 0, 0, 0, 0, 9, 9, 9], spec)
    expect(Array.from(result.segmentation!.labelMap)).toEqual([1, 2, 2, 2])
    expect(result.segmentation?.classes[0].coverage).toBeCloseTo(0.25)
    expect(result.segmentation?.classes[1].coverage).toBeCloseTo(0.75)
  })

  it('reports no finding when nothing crosses the threshold', () => {
    const spec = segSpec()
    const result = interpretSegmentation([-5, -5, -5, -5, -5, -5, -5, -5], spec)
    expect(result.safetyTier).toBe('no_finding')
    expect(Array.from(result.segmentation!.labelMap)).toEqual([0, 0, 0, 0])
  })

  it('benign classes (suspicious: false) do not raise the tier', () => {
    const spec = segSpec({ labels: [{ name: 'Lesion', suspicious: false }, { name: 'Effusion', suspicious: false }] })
    const result = interpretSegmentation([5, 5, 5, 5, -5, -5, -5, -5], spec)
    expect(result.safetyTier).toBe('no_finding')
  })
})

describe('interpretDetection', () => {
  function detSpec(overrides?: Partial<ClaritySpec['output']>): ClaritySpec {
    return makeSpec({
      output: {
        task: 'detection',
        activation: 'none',
        shape: [1, 3, 6],
        classes: ['Nodule', 'Mass'],
        detection: { box_format: 'xyxy', max_detections: 3, score_threshold: 0.5, coord_space: 'normalized' },
        ...overrides,
      },
      thresholds: { validation_status: 'unvalidated' },
    })
  }

  it('drops padding rows below the score threshold and ranks by score', () => {
    const spec = detSpec()
    const raw = new Float32Array([
      0.0, 0.0, 0.5, 0.5, 0.9, 0, // Nodule, score 0.9
      0.1, 0.1, 0.2, 0.2, 0.2, 1, // below threshold → dropped
      0.3, 0.3, 0.6, 0.6, 0.7, 1, // Mass, score 0.7
    ])
    const result = interpretDetection(Array.from(raw), spec)
    expect(result.detections).toHaveLength(2)
    expect(result.detections?.[0].label).toBe('Nodule')
    expect(result.detections?.[1].label).toBe('Mass')
  })

  it('converts xyxy boxes to normalized xywh', () => {
    const spec = detSpec()
    const result = interpretDetection([0.2, 0.1, 0.6, 0.5, 0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], spec)
    const box = result.detections?.[0].box
    expect(box?.x).toBeCloseTo(0.2)
    expect(box?.y).toBeCloseTo(0.1)
    expect(box?.w).toBeCloseTo(0.4)
    expect(box?.h).toBeCloseTo(0.4)
  })

  it('converts pixel coords to normalized using the input shape', () => {
    const spec = detSpec({
      detection: { box_format: 'xywh', max_detections: 3, score_threshold: 0.5, coord_space: 'pixel' },
    })
    // input is 224×224; a box at x=112,y=56,w=112,h=112
    const result = interpretDetection([112, 56, 112, 112, 0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], spec)
    const box = result.detections?.[0].box
    expect(box?.x).toBeCloseTo(0.5)
    expect(box?.y).toBeCloseTo(0.25)
    expect(box?.w).toBeCloseTo(0.5)
  })

  it('reports no detections when all rows are below threshold', () => {
    const spec = detSpec()
    const result = interpretDetection(new Array(18).fill(0), spec)
    expect(result.detections).toHaveLength(0)
    expect(result.safetyTier).toBe('no_finding')
  })
})
