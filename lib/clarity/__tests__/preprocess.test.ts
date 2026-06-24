// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { preprocessImage } from '../preprocess'
import type { ClaritySpec } from '../types'

function makeSpec(shapeOverride?: number[]): ClaritySpec {
  return {
    id: 'test',
    name: 'Test',
    version: '1.0.0',
    certified: false,
    bodypart: 'chest',
    modality: 'xray',
    model: { file: 'model.onnx' },
    input: {
      shape: shapeOverride ?? [1, 1, 4, 4],
      normalize: { mean: [0.5], std: [0.5] },
    },
    output: { classes: ['Normal', 'Abnormal'], activation: 'softmax' },
    safety: { tier: 'screening', disclaimer: 'Test.' },
    thresholds: { possible_finding: 0.5, low_confidence: 0.2, validation_status: 'unvalidated' },
  }
}

// ─── Argument validation (no DOM needed) ─────────────────────────────────────

describe('preprocessImage — argument validation', () => {
  const mockFile = new File([''], 'test.png', { type: 'image/png' })

  it('throws when input.shape has fewer than 4 elements', async () => {
    const spec = makeSpec([1, 224, 224])
    await expect(preprocessImage(mockFile, spec)).rejects.toThrow(/shape/)
  })

  it('throws when input.shape has more than 4 elements', async () => {
    const spec = makeSpec([1, 1, 224, 224, 1])
    await expect(preprocessImage(mockFile, spec)).rejects.toThrow(/shape/)
  })

  it('throws when batch dimension is not 1', async () => {
    const spec = makeSpec([2, 1, 224, 224])
    await expect(preprocessImage(mockFile, spec)).rejects.toThrow(/batch/)
  })

  it('throws when height is zero', async () => {
    const spec = makeSpec([1, 1, 0, 224])
    await expect(preprocessImage(mockFile, spec)).rejects.toThrow()
  })

  it('throws when width is zero', async () => {
    const spec = makeSpec([1, 1, 224, 0])
    await expect(preprocessImage(mockFile, spec)).rejects.toThrow()
  })

  it('throws when channels is zero', async () => {
    const spec = makeSpec([1, 0, 224, 224])
    await expect(preprocessImage(mockFile, spec)).rejects.toThrow()
  })
})

// ─── Pixel pipeline (mocked DOM) ─────────────────────────────────────────────

describe('preprocessImage — pixel pipeline', () => {
  let originalSrcDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()

    originalSrcDescriptor = Object.getOwnPropertyDescriptor(global.Image.prototype, 'src')
    Object.defineProperty(global.Image.prototype, 'src', {
      configurable: true,
      set(value) {
        setTimeout(() => {
          if (this.onload) this.onload()
        }, 0)
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalSrcDescriptor) {
      Object.defineProperty(global.Image.prototype, 'src', originalSrcDescriptor)
    }
  })

  function buildCanvasMock(pixelData: Uint8ClampedArray) {
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixelData })),
    }
    const mockCanvas = { width: 0 as number, height: 0 as number, getContext: () => mockCtx }
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return origCreate(tag)
    })
    return mockCtx
  }

  it('returns Float32Array of correct length for 1-channel mean/std spec', async () => {
    const spec = makeSpec([1, 1, 4, 4]) // 16 pixels

    // 16 grey pixels (128,128,128,255)
    const pixels = new Uint8ClampedArray(64)
    for (let i = 0; i < 16; i++) {
      pixels[i * 4] = 128
      pixels[i * 4 + 1] = 128
      pixels[i * 4 + 2] = 128
      pixels[i * 4 + 3] = 255
    }
    buildCanvasMock(pixels)



    const file = new File([''], 'test.png', { type: 'image/png' })
    const result = await preprocessImage(file, spec)

    expect(result).toBeInstanceOf(Float32Array)
    expect(result).toHaveLength(16)
  })

  it('all pixel values are within a finite range after normalization', async () => {
    const spec = makeSpec([1, 1, 4, 4])

    const pixels = new Uint8ClampedArray(64).fill(200)
    buildCanvasMock(pixels)


    const file = new File([''], 'test.png', { type: 'image/png' })
    const result = await preprocessImage(file, spec)

    for (const v of result) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('1-channel 224×224 spec produces output length 1×1×224×224', async () => {
    const spec = makeSpec([1, 1, 224, 224]) // 1 * 224 * 224 = 50176 elements

    const pixels = new Uint8ClampedArray(224 * 224 * 4).fill(128)
    buildCanvasMock(pixels)


    const file = new File([''], 'test.png', { type: 'image/png' })
    const result = await preprocessImage(file, spec)

    expect(result).toBeInstanceOf(Float32Array)
    expect(result).toHaveLength(50176)
  })

  it('3-channel spec produces output length = channels × H × W', async () => {
    const spec = makeSpec([1, 3, 4, 4]) // 3 * 4 * 4 = 48 elements
    // Override normalize to mean/std for 3 channels
    ;(spec.input as unknown as { normalize: unknown }).normalize = {
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
    }

    const pixels = new Uint8ClampedArray(64).fill(128) // 16 pixels
    buildCanvasMock(pixels)


    const file = new File([''], 'test.png', { type: 'image/png' })
    const result = await preprocessImage(file, spec)

    expect(result).toBeInstanceOf(Float32Array)
    expect(result).toHaveLength(48)
  })
})
