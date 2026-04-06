'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as ort from 'onnxruntime-web'

import { fetchManifest, getCurrentModel } from '@/lib/clarity/manifest'
import { sha256 } from '@/lib/clarity/hash'
import { postprocess, type SafeResult } from '@/lib/clarity/postprocess'
import { preprocessImage } from '@/lib/clarity/preprocess'
import { runInference, sessionCache as runtimeSessionCache } from '@/lib/clarity/run'
import { fetchSpec } from '@/lib/clarity/specLoader'
import { type ClaritySpec, validateSpec } from '@/lib/clarity/types'

export type ClarityRayStatus =
  | 'idle'
  | 'loading_manifest'
  | 'loading_spec'
  | 'downloading_model'
  | 'verifying_model'
  | 'ready'
  | 'processing'
  | 'complete'
  | 'error'

export interface ModelInfo {
  id: string
  name: string
  version: string
  inputShape: number[]
  outputClasses: string[]
  bodypart: string
  modality: string
  thresholds?: {
    possible_finding?: number
    low_confidence?: number
    validation_status?: string
  }
}

export interface SystemLog {
  id: string
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

const LOCAL_STORAGE_MODEL_KEY = 'clarityray_selected_model'
const DEFAULT_MODEL_SLUG = 'densenet121-chest'
const MODEL_CACHE_NAME = 'clarityray-models'

// Outside the component — persists across re-renders
const sessionCache = new Map<string, ort.InferenceSession>()

function getSessionKey(spec: ClaritySpec): string {
  return `${spec.id}@${spec.version}`
}

async function loadModelWithProgress(
  url: string,
  spec: ClaritySpec,
  onProgress: (bytesLoaded: number, bytesTotal: number) => void
): Promise<ArrayBuffer> {
  void spec

  const cacheStore = await caches.open(MODEL_CACHE_NAME)
  const cached = await cacheStore.match(url)
  if (cached) {
    const cachedBuffer = await cached.arrayBuffer()
    onProgress(cachedBuffer.byteLength, cachedBuffer.byteLength)
    return cachedBuffer
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download model: HTTP ${response.status}`)
  }

  const contentLengthHeader = response.headers.get('Content-Length')
  const bytesTotal = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : 0
  const reader = response.body?.getReader()

  if (!reader) {
    const fallbackBuffer = await response.arrayBuffer()
    onProgress(fallbackBuffer.byteLength, fallbackBuffer.byteLength)
    await cacheStore.put(
      url,
      new Response(fallbackBuffer, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
    )
    return fallbackBuffer
  }

  const chunks: Uint8Array[] = []
  let bytesLoaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    if (!value) {
      continue
    }

    chunks.push(value)
    bytesLoaded += value.byteLength
    onProgress(bytesLoaded, bytesTotal > 0 ? bytesTotal : bytesLoaded)
  }

  const merged = new Uint8Array(bytesLoaded)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  const buffer = merged.buffer
  await cacheStore.put(
    url,
    new Response(buffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  )

  return buffer
}

async function createInferenceSession(modelBuffer: ArrayBuffer): Promise<ort.InferenceSession> {
  const modelArray = new Uint8Array(modelBuffer)
  return ort.InferenceSession.create(modelArray)
}

function toModelInfo(spec: ClaritySpec): ModelInfo {
  return {
    id: spec.id,
    name: spec.name,
    version: spec.version,
    inputShape: spec.input.shape,
    outputClasses: spec.output.classes,
    bodypart: spec.bodypart,
    modality: spec.modality,
    thresholds: {
      possible_finding: spec.thresholds.possible_finding,
      low_confidence: spec.thresholds.low_confidence,
      validation_status: spec.thresholds.validation_status,
    },
  }
}

function makeSystemLog(level: SystemLog['level'], message: string): SystemLog {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    level,
    message,
  }
}

export function useClarityRay() {
  const [status, setStatus] = useState<ClarityRayStatus>('idle')
  const [result, setResult] = useState<SafeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [logs, setLogs] = useState<SystemLog[]>([])

  const statusRef = useRef<ClarityRayStatus>('idle')
  const specRef = useRef<ClaritySpec | null>(null)
  const modelUrlRef = useRef<string | null>(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const addLog = useCallback((level: SystemLog['level'], message: string): void => {
    try {
      setLogs((previous) => {
        const next = [...previous, makeSystemLog(level, message)]
        return next.slice(-50)
      })
    } catch {
      // addLog must never throw
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const init = async (): Promise<void> => {
      try {
        const _tick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        const preferredModel = localStorage.getItem(LOCAL_STORAGE_MODEL_KEY) ?? DEFAULT_MODEL_SLUG

        setStatus('loading_manifest')
        addLog('info', 'Fetching model manifest...')
        await _tick()
        const manifest = await fetchManifest()
        const manifestModel = manifest.models[preferredModel]
          ? manifest.models[preferredModel]
          : getCurrentModel(manifest)
        const selectedModelId = manifest.models[preferredModel] ? preferredModel : manifest.current_model
        addLog('info', `Manifest loaded — model: ${selectedModelId}`)

        if (cancelled) {
          return
        }

        setStatus('loading_spec')
        addLog('info', 'Fetching clarity.json spec...')
        await _tick()
        const spec = await fetchSpec(manifestModel.spec_url)
        addLog('info', `Spec validated — input shape: ${spec.input.shape.join('×')}`)

        if (cancelled) {
          return
        }

        specRef.current = validateSpec(spec)
        setModelInfo(toModelInfo(spec))
        modelUrlRef.current = manifestModel.url

        setStatus('downloading_model')
        addLog('info', 'Checking local cache for model binary...')
        await _tick()
        const modelBuffer = await loadModelWithProgress(
          manifestModel.url,
          spec,
          (bytesLoaded, bytesTotal) => {
            const denominator = bytesTotal > 0 ? bytesTotal : bytesLoaded
            const pct = denominator > 0 ? Math.round((bytesLoaded / denominator) * 100) : 0
            addLog('info', `Downloading model... ${pct}%`)
          }
        )

        if (cancelled) {
          return
        }

        setStatus('verifying_model')
        addLog('info', 'Verifying model integrity...')
        await _tick()

        if (spec.integrity?.sha256) {
          const hash = await sha256(modelBuffer)
          if (hash !== spec.integrity.sha256) {
            throw new Error('Integrity check failed: hash mismatch')
          }
          addLog('success', 'Integrity verified ✓')
        } else {
          addLog('warn', 'No integrity hash in spec — skipping verification')
        }

        if (cancelled) {
          return
        }

        const sessionKey = getSessionKey(spec)
        if (!sessionCache.has(sessionKey)) {
          const session = await createInferenceSession(modelBuffer)
          sessionCache.set(sessionKey, session)
          runtimeSessionCache.set(spec.id, session)
        }

        if (!cancelled) {
          setStatus('ready')
          addLog('success', 'System ready — upload a scan to analyze')
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Initialization failed'
          setStatus('error')
          setError(msg)
          addLog('error', msg)
        }
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [addLog])

  const runAnalysis = useCallback(async (file: File): Promise<void> => {
    if (statusRef.current !== 'ready') {
      return
    }

    const spec = specRef.current
    if (!spec || !modelInfo) {
      addLog('error', 'Model spec not loaded — cannot analyze')
      return
    }

    setStatus('processing')
    setResult(null)
    setError(null)
    addLog('info', `Analysis started: ${file.name}`)

    try {
      const tensor = await preprocessImage(file, spec)
      addLog('info', 'Image preprocessed')

      const rawOutput = await runInference(tensor, spec)
      addLog('info', 'Inference complete')

      const nextResult = postprocess(rawOutput, spec)

      setResult(nextResult)
      setStatus('complete')
      addLog('success', `Finding: ${nextResult.primaryFinding} (${nextResult.confidencePercent}%)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      setStatus('error')
      setError(message)
      addLog('error', message)
    }
  }, [addLog, modelInfo])

  const reset = useCallback((): void => {
    setResult(null)
    setError(null)

    const spec = specRef.current
    if (spec && sessionCache.has(getSessionKey(spec))) {
      setStatus('ready')
      return
    }

    setStatus('idle')
  }, [])

  return {
    status,
    result,
    error,
    modelInfo,
    logs,
    runAnalysis,
    reset,
  }
}
