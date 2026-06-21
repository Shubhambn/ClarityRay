import { describe, it, expect } from 'vitest'
import { validateSpec } from '../types'

const VALID_SPEC = {
  id: 'densenet121-chest',
  name: 'DenseNet-121 Chest X-ray',
  version: '1.0.0',
  certified: false,
  bodypart: 'chest',
  modality: 'xray',
  model: { file: 'model.onnx' },
  input: {
    shape: [1, 1, 224, 224],
    normalize: { mean: [0.485], std: [0.229] },
  },
  output: {
    classes: ['Normal', 'Abnormal'],
    activation: 'softmax',
  },
  safety: {
    tier: 'screening',
    disclaimer: 'This is a screening tool only.',
  },
  thresholds: {
    possible_finding: 0.5,
    low_confidence: 0.2,
    validation_status: 'unvalidated',
  },
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('validateSpec — valid input', () => {
  it('accepts a complete valid spec and returns all fields', () => {
    const result = validateSpec(VALID_SPEC)
    expect(result.id).toBe('densenet121-chest')
    expect(result.certified).toBe(false)
    expect(result.output.classes).toEqual(['Normal', 'Abnormal'])
    expect(result.thresholds.possible_finding).toBe(0.5)
  })

  it('accepts a spec with optional integrity field', () => {
    const spec = { ...VALID_SPEC, integrity: { sha256: 'a'.repeat(64) } }
    const result = validateSpec(spec)
    expect(result.integrity?.sha256).toBe('a'.repeat(64))
  })

  it('accepts integrity with mixed-case sha256 by lowercasing it', () => {
    const spec = { ...VALID_SPEC, integrity: { sha256: 'A'.repeat(64) } }
    const result = validateSpec(spec)
    expect(result.integrity?.sha256).toBe('a'.repeat(64))
  })

  it('accepts a spec without the optional integrity field', () => {
    const result = validateSpec(VALID_SPEC)
    expect(result.integrity).toBeUndefined()
  })

  it('accepts semver with pre-release identifier', () => {
    const spec = { ...VALID_SPEC, version: '2.0.0-beta.1' }
    const result = validateSpec(spec)
    expect(result.version).toBe('2.0.0-beta.1')
  })

  it('accepts semver with build metadata', () => {
    const spec = { ...VALID_SPEC, version: '1.0.0+20231201' }
    const result = validateSpec(spec)
    expect(result.version).toBe('1.0.0+20231201')
  })

  it('accepts all valid safety tiers', () => {
    for (const tier of ['screening', 'research', 'investigational'] as const) {
      const spec = { ...VALID_SPEC, safety: { ...VALID_SPEC.safety, tier } }
      expect(() => validateSpec(spec)).not.toThrow()
    }
  })

  it('accepts all valid activation types', () => {
    for (const activation of ['softmax', 'sigmoid', 'none'] as const) {
      const spec = { ...VALID_SPEC, output: { ...VALID_SPEC.output, activation } }
      expect(() => validateSpec(spec)).not.toThrow()
    }
  })

  it('accepts both validation status values', () => {
    for (const status of ['unvalidated', 'validated'] as const) {
      const spec = { ...VALID_SPEC, thresholds: { ...VALID_SPEC.thresholds, validation_status: status } }
      expect(() => validateSpec(spec)).not.toThrow()
    }
  })

  it('accepts optional model.format field', () => {
    const spec = { ...VALID_SPEC, model: { file: 'model.onnx', format: 'onnx' } }
    const result = validateSpec(spec)
    expect(result.model.format).toBe('onnx')
  })

  it('accepts optional input.layout field', () => {
    const spec = { ...VALID_SPEC, input: { ...VALID_SPEC.input, layout: 'NCHW' } }
    const result = validateSpec(spec)
    expect(result.input.layout).toBe('NCHW')
  })

  it('accepts an optional source_model block with selected_findings', () => {
    const spec = {
      ...VALID_SPEC,
      source_model: {
        family: 'DenseNet121',
        source: 'TorchXRayVision densenet121-res224-all',
        selected_findings: ['Mass', 'Nodule'],
      },
    }
    const result = validateSpec(spec)
    expect(result.source_model?.family).toBe('DenseNet121')
    expect(result.source_model?.selected_findings).toEqual(['Mass', 'Nodule'])
  })

  it('accepts a minimal source_model without selected_findings', () => {
    const spec = { ...VALID_SPEC, source_model: { family: 'X', source: 'Y' } }
    const result = validateSpec(spec)
    expect(result.source_model?.selected_findings).toBeUndefined()
  })

  it('omits source_model when not present', () => {
    const result = validateSpec(VALID_SPEC)
    expect(result.source_model).toBeUndefined()
  })
})

// ─── task-aware output / thresholds ────────────────────────────────────────────

describe('validateSpec — task discriminator', () => {
  it('defaults output.task to "binary" when absent', () => {
    const result = validateSpec(VALID_SPEC)
    expect(result.output.task).toBe('binary')
  })

  it('accepts every task value', () => {
    for (const task of ['binary', 'multilabel', 'multiclass', 'regression'] as const) {
      const spec = {
        ...VALID_SPEC,
        output: { ...VALID_SPEC.output, task },
        // binary keeps the single-score thresholds; other tasks may omit them
        thresholds:
          task === 'binary'
            ? VALID_SPEC.thresholds
            : { validation_status: 'unvalidated' },
      }
      expect(() => validateSpec(spec)).not.toThrow()
    }
  })

  it('throws on an unknown task', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, output: { ...VALID_SPEC.output, task: 'segmentation' } })
    ).toThrow(/task/)
  })

  it('binary still requires possible_finding and low_confidence', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, thresholds: { validation_status: 'unvalidated' } })
    ).toThrow(/possible_finding/)
  })

  it('multilabel may omit the single-score thresholds', () => {
    const spec = {
      ...VALID_SPEC,
      output: {
        task: 'multilabel',
        classes: ['Mass', 'Nodule'],
        activation: 'sigmoid',
        labels: [{ name: 'Mass', threshold: 0.4, suspicious: true }],
      },
      thresholds: { validation_status: 'unvalidated' },
    }
    const result = validateSpec(spec)
    expect(result.output.task).toBe('multilabel')
    expect(result.output.labels?.[0]).toEqual({ name: 'Mass', threshold: 0.4, suspicious: true })
    expect(result.thresholds.possible_finding).toBeUndefined()
  })

  it('rejects a label whose name is not in classes', () => {
    expect(() =>
      validateSpec({
        ...VALID_SPEC,
        output: {
          task: 'multilabel',
          classes: ['Mass'],
          activation: 'sigmoid',
          labels: [{ name: 'Nodule' }],
        },
        thresholds: { validation_status: 'unvalidated' },
      })
    ).toThrow(/Nodule/)
  })

  it('rejects a label threshold outside [0, 1]', () => {
    expect(() =>
      validateSpec({
        ...VALID_SPEC,
        output: {
          task: 'multilabel',
          classes: ['Mass'],
          activation: 'sigmoid',
          labels: [{ name: 'Mass', threshold: 1.5 }],
        },
        thresholds: { validation_status: 'unvalidated' },
      })
    ).toThrow()
  })

  it('accepts regression units, range and bands', () => {
    const spec = {
      ...VALID_SPEC,
      output: {
        task: 'regression',
        classes: ['CTR'],
        activation: 'none',
        units: 'ratio',
        range: [0, 1],
        bands: [{ min: 0.5, tier: 'possible_finding', label: 'Cardiomegaly range' }],
      },
      thresholds: { validation_status: 'unvalidated' },
    }
    const result = validateSpec(spec)
    expect(result.output.units).toBe('ratio')
    expect(result.output.range).toEqual([0, 1])
    expect(result.output.bands?.[0].tier).toBe('possible_finding')
  })

  it('accepts null units and range', () => {
    const spec = {
      ...VALID_SPEC,
      output: { task: 'regression', classes: ['x'], activation: 'none', units: null, range: null },
      thresholds: { validation_status: 'unvalidated' },
    }
    const result = validateSpec(spec)
    expect(result.output.units).toBeNull()
    expect(result.output.range).toBeNull()
  })

  it('rejects a range with min > max', () => {
    expect(() =>
      validateSpec({
        ...VALID_SPEC,
        output: { task: 'regression', classes: ['x'], activation: 'none', range: [1, 0] },
        thresholds: { validation_status: 'unvalidated' },
      })
    ).toThrow()
  })

  it('rejects an unknown output key', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, output: { ...VALID_SPEC.output, bogus: true } })
    ).toThrow(/bogus/)
  })
})

// ─── source_model validation errors ───────────────────────────────────────────

describe('validateSpec — source_model errors', () => {
  it('throws when source_model.family is missing', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, source_model: { source: 'Y' } })
    ).toThrow()
  })

  it('throws when source_model has an unknown key', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, source_model: { family: 'X', source: 'Y', bogus: 1 } })
    ).toThrow()
  })

  it('throws when source_model.selected_findings contains an empty string', () => {
    expect(() =>
      validateSpec({
        ...VALID_SPEC,
        source_model: { family: 'X', source: 'Y', selected_findings: [''] },
      })
    ).toThrow()
  })
})

// ─── Top-level type errors ────────────────────────────────────────────────────

describe('validateSpec — top-level errors', () => {
  it('throws when given null', () => {
    expect(() => validateSpec(null)).toThrow()
  })

  it('throws when given a string', () => {
    expect(() => validateSpec('not-an-object')).toThrow()
  })

  it('throws when given a number', () => {
    expect(() => validateSpec(42)).toThrow()
  })

  it('throws when given an array', () => {
    expect(() => validateSpec([])).toThrow()
  })

  it('throws on unknown top-level field', () => {
    expect(() => validateSpec({ ...VALID_SPEC, unknownField: true })).toThrow(/unknownField/)
  })
})

// ─── Required field errors ────────────────────────────────────────────────────

describe('validateSpec — missing required fields', () => {
  it('throws when id is missing', () => {
    const { id: _, ...rest } = VALID_SPEC
    expect(() => validateSpec(rest)).toThrow()
  })

  it('throws when name is missing', () => {
    const { name: _, ...rest } = VALID_SPEC
    expect(() => validateSpec(rest)).toThrow()
  })

  it('throws when version is missing', () => {
    const { version: _, ...rest } = VALID_SPEC
    expect(() => validateSpec(rest)).toThrow()
  })

  it('throws when certified is missing', () => {
    const { certified: _, ...rest } = VALID_SPEC
    expect(() => validateSpec(rest)).toThrow()
  })

  it('throws when bodypart is missing', () => {
    const { bodypart: _, ...rest } = VALID_SPEC
    expect(() => validateSpec(rest)).toThrow()
  })

  it('throws when modality is missing', () => {
    const { modality: _, ...rest } = VALID_SPEC
    expect(() => validateSpec(rest)).toThrow()
  })
})

// ─── Field-level validation errors ───────────────────────────────────────────

describe('validateSpec — field validation', () => {
  it('throws when certified is true', () => {
    expect(() => validateSpec({ ...VALID_SPEC, certified: true })).toThrow()
  })

  it('throws when id is an empty string', () => {
    expect(() => validateSpec({ ...VALID_SPEC, id: '' })).toThrow()
  })

  it('throws when version is not semver (no patch)', () => {
    expect(() => validateSpec({ ...VALID_SPEC, version: '1.0' })).toThrow()
  })

  it('throws when version is not semver (has leading v)', () => {
    expect(() => validateSpec({ ...VALID_SPEC, version: 'v1.0.0' })).toThrow()
  })

  it('throws when input.shape contains zero', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, input: { ...VALID_SPEC.input, shape: [1, 1, 0, 224] } })
    ).toThrow()
  })

  it('throws when input.shape contains negative number', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, input: { ...VALID_SPEC.input, shape: [1, 1, -1, 224] } })
    ).toThrow()
  })

  it('throws when input.shape is empty', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, input: { ...VALID_SPEC.input, shape: [] } })
    ).toThrow()
  })

  it('throws when output.activation is invalid', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, output: { ...VALID_SPEC.output, activation: 'relu' } })
    ).toThrow()
  })

  it('throws when output.classes is empty', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, output: { ...VALID_SPEC.output, classes: [] } })
    ).toThrow()
  })

  it('throws when thresholds.possible_finding > 1', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, thresholds: { ...VALID_SPEC.thresholds, possible_finding: 1.1 } })
    ).toThrow()
  })

  it('throws when thresholds.low_confidence < 0', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, thresholds: { ...VALID_SPEC.thresholds, low_confidence: -0.1 } })
    ).toThrow()
  })

  it('throws when thresholds.validation_status is invalid', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, thresholds: { ...VALID_SPEC.thresholds, validation_status: 'pending' } })
    ).toThrow()
  })

  it('throws when safety.tier is invalid', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, safety: { ...VALID_SPEC.safety, tier: 'clinical' } })
    ).toThrow()
  })

  it('throws when safety.disclaimer is empty string', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, safety: { ...VALID_SPEC.safety, disclaimer: '' } })
    ).toThrow()
  })

  it('throws when integrity sha256 is wrong length', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, integrity: { sha256: 'abc123' } })
    ).toThrow()
  })

  it('throws when integrity sha256 contains non-hex characters', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, integrity: { sha256: 'z'.repeat(64) } })
    ).toThrow()
  })

  it('throws when model.file is empty', () => {
    expect(() =>
      validateSpec({ ...VALID_SPEC, model: { file: '' } })
    ).toThrow()
  })
})
