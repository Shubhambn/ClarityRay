import type { ClaritySpec } from './types'

// ─── Worker message types ───────────────────────────────────────────────────

type WorkerIn =
  | { type: 'LOAD_MODEL'; id: string; specId: string; modelBuffer: ArrayBuffer }
  | { type: 'RUN_INFERENCE'; id: string; specId: string; imageData: Float32Array; inputShape: number[]; inputName: string; outputName: string }

type WorkerOut =
  | { type: 'LOADED'; id: string }
  | { type: 'RESULT'; id: string; result: Float32Array }
  | { type: 'ERROR'; id: string; error: string }

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

// ─── Worker singleton ───────────────────────────────────────────────────────

const loadedModels = new Set<string>()
const _fallbackUrls = new Map<string, string>()
const pending = new Map<string, Pending>()
let _worker: Worker | null = null
let _workerDead = false
let _workerRestartAttempts = 0
const WORKER_MAX_RESTARTS = 3
const WORKER_RESTART_BACKOFF_MS = [1_000, 2_000, 4_000] as const

function getWorker(): Worker | null {
  if (_workerDead) return null
  if (_worker) return _worker

  try {
    // Path is relative to this file (lib/clarity/ → ../../workers/)
    _worker = new Worker(new URL('../../workers/inference.worker.ts', import.meta.url))

    _worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const msg = event.data
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)

      if (msg.type === 'ERROR') {
        p.reject(new Error(msg.error))
      } else if (msg.type === 'LOADED') {
        p.resolve(undefined)
      } else if (msg.type === 'RESULT') {
        p.resolve(msg.result)
      }
    }

    _worker.onerror = (ev) => {
      _workerDead = true
      _worker = null
      const err = new Error(`Inference worker crashed: ${ev.message ?? 'unknown error'}`)
      for (const p of pending.values()) p.reject(err)
      pending.clear()
      // New worker has no sessions; callers must reload models after restart.
      loadedModels.clear()
      // Restart with exponential backoff up to WORKER_MAX_RESTARTS; beyond that,
      // all inference falls through to the main-thread path permanently.
      if (_workerRestartAttempts < WORKER_MAX_RESTARTS) {
        const delay = WORKER_RESTART_BACKOFF_MS[_workerRestartAttempts] ?? 4_000
        _workerRestartAttempts++
        setTimeout(() => { _workerDead = false }, delay)
      }
    }

    return _worker
  } catch {
    _workerDead = true
    return null
  }
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function getModelNodeName(
  model: ClaritySpec['model'],
  key: 'inputName' | 'outputName',
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(model, key)) return undefined
  const value: unknown = Reflect.get(model, key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getExpectedLength(shape: number[]): number {
  return shape.reduce((a, b) => a * b, 1)
}

function getModelFileName(file: string): string {
  const trimmed = file.trim()
  assert(trimmed.length > 0, 'spec.model.file must be a non-empty string.')
  const withoutQueryOrHash = trimmed.split(/[?#]/, 1)[0] ?? ''
  const segments = withoutQueryOrHash.split('/').filter((s) => s.length > 0)
  const fileName = segments[segments.length - 1] ?? ''
  assert(fileName.length > 0, 'spec.model.file must contain a filename.')
  return fileName
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load a model binary into the inference worker (or the main-thread fallback).
 * The ArrayBuffer is transferred to the worker to avoid a large copy.
 */
export async function loadModelInWorker(
  modelBuffer: ArrayBuffer,
  specId: string,
  modelUrl?: string,
): Promise<void> {
  if (loadedModels.has(specId)) return

  if (modelUrl) {
    _fallbackUrls.set(specId, modelUrl)
  }

  const worker = getWorker()

  if (worker) {
    const id = crypto.randomUUID()
    await new Promise<void>((resolve, reject) => {
      pending.set(id, { resolve: resolve as Pending['resolve'], reject })
      const msg: WorkerIn = { type: 'LOAD_MODEL', id, specId, modelBuffer }
      worker.postMessage(msg, [modelBuffer])
    })
    // Only mark loaded after the worker acknowledges; when worker is dead the model
    // is loaded on demand by runInferenceMainThread during the first inference call.
    loadedModels.add(specId)
  }
}

const INFERENCE_TIMEOUT_MS = 60_000

/**
 * Run inference on the worker thread. Falls back to the main thread only if
 * the worker is unavailable (rare: browser restriction or startup failure).
 */
export async function runInference(
  imageData: Float32Array,
  spec: ClaritySpec,
): Promise<Float32Array> {
  assert(imageData instanceof Float32Array, 'runInference expected imageData to be a Float32Array.')

  const shape = spec.input.shape
  assert(shape.length > 0, 'spec.input.shape must be a non-empty array.')

  const expectedLength = getExpectedLength(shape)
  assert(
    imageData.length === expectedLength,
    `imageData length mismatch: got ${imageData.length}, expected ${expectedLength}.`,
  )

  const inputName = getModelNodeName(spec.model, 'inputName') ?? 'input'
  const outputName = getModelNodeName(spec.model, 'outputName') ?? 'output'

  const worker = getWorker()

  if (worker) {
    const id = crypto.randomUUID()
    // Slice to get a transferable copy — the original tensor may be referenced by caller
    const copy = imageData.slice()

    return new Promise<Float32Array>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Inference timed out after ${INFERENCE_TIMEOUT_MS / 1000}s.`))
      }, INFERENCE_TIMEOUT_MS)
      pending.set(id, {
        resolve: (v) => { clearTimeout(timeoutId); resolve(v as Float32Array) },
        reject: (e) => { clearTimeout(timeoutId); reject(e) },
      })
      const msg: WorkerIn = {
        type: 'RUN_INFERENCE',
        id,
        specId: spec.id,
        imageData: copy,
        inputShape: shape,
        inputName,
        outputName,
      }
      worker.postMessage(msg, [copy.buffer])
    })
  }

  // Main-thread fallback — loads ORT only when the worker path is unavailable
  return runInferenceMainThread(imageData, spec, inputName, outputName)
}

// ─── Main-thread fallback ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _fallbackSessions = new Map<string, any>()

async function runInferenceMainThread(
  imageData: Float32Array,
  spec: ClaritySpec,
  inputName: string,
  outputName: string,
): Promise<Float32Array> {
  const ort = await import('onnxruntime-web')

  let session = _fallbackSessions.get(spec.id)
  if (!session) {
    const modelFile = getModelFileName(spec.model.file)
    const storedUrl = _fallbackUrls.get(spec.id)
    const modelPath = storedUrl ?? `/models/${spec.id}/${modelFile}`
    session = await ort.InferenceSession.create(modelPath)
    _fallbackSessions.set(spec.id, session)
  }

  // Resolve graph node names from the session itself (see worker for rationale):
  // honor the spec-provided name when it matches, else use the session's first.
  const resolvedInput: string = session.inputNames.includes(inputName)
    ? inputName
    : session.inputNames[0]
  const resolvedOutput: string | undefined = session.outputNames.includes(outputName)
    ? outputName
    : session.outputNames[0]

  const tensor = new ort.Tensor('float32', imageData, spec.input.shape)
  const outputs = await session.run({ [resolvedInput]: tensor })

  const preferredOutput = resolvedOutput ? outputs[resolvedOutput] : undefined
  const fallbackKey = Object.keys(outputs)[0]
  const outputTensor = preferredOutput ?? (fallbackKey ? outputs[fallbackKey] : undefined)
  assert(outputTensor !== undefined, 'Model run returned no output tensors.')

  const outputData = outputTensor.data
  return outputData instanceof Float32Array
    ? outputData
    : Float32Array.from(outputData as ArrayLike<number>)
}

// ─── State helpers ───────────────────────────────────────────────────────────

export function hasSession(specId: string): boolean {
  return loadedModels.has(specId)
}

// Backward-compatible facade — callers that set sessionCache.set() still work
export const sessionCache = {
  set: (specId: string, _: unknown): void => { loadedModels.add(specId) },
  get: (_: string): undefined => undefined,
  has: (specId: string): boolean => loadedModels.has(specId),
  delete: (specId: string): boolean => loadedModels.delete(specId),
  clear: (): void => { loadedModels.clear() },
}
