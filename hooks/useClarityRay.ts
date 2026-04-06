'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as ort from 'onnxruntime-web'

import { BackendError, fetchModelBySlug } from '@/lib/api/client'
import { sha256 } from '@/lib/clarity/hash'
import { postprocess, type SafeResult } from '@/lib/clarity/postprocess'
import { preprocessImage } from '@/lib/clarity/preprocess'
import { runInference, sessionCache as runtimeSessionCache } from '@/lib/clarity/run'
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

type HookErrorContext =
  | 'network'
  | 'timeout'
  | 'onnx-load'
  | 'preprocess'
  | 'inference'
  | 'cache'
  | 'generic'

const LOCAL_STORAGE_MODEL_KEY = 'clarityray_selected_model'
const DEFAULT_MODEL_SLUG = 'densenet121-chest'
const LOCAL_SPEC_FALLBACK_URL = '/models/densenet121-chest/clarity.json'
const LOCAL_MODEL_FALLBACK_URL = '/models/densenet121-chest/model.onnx'
const MODEL_CACHE_NAME = 'clarityray-models'

// Outside the component — persists across re-renders
const sessionCache = new Map<string, ort.InferenceSession>()

function getSessionKey(spec: ClaritySpec): string {
  return `${spec.id}@${spec.version}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return 'Unknown error'
}

function mapFriendlyError(context: HookErrorContext, error: unknown): string {
  const message = toErrorMessage(error).toLowerCase()

  if (context === 'timeout' || message.includes('timed out') || message.includes('aborterror')) {
    return 'Download timed out. The model file may be too large or your connection is slow.'
  }

  if (
    context === 'network' ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('cannot reach backend api')
  ) {
    return 'No internet connection. Check your connection and try again.'
  }

  if (context === 'cache' || message.includes('quotaexceedederror') || message.includes('storage')) {
    return 'Storage is full. Clear your browser storage and try again.'
  }

  if (context === 'onnx-load') {
    return 'Failed to load the AI model. The model file may be corrupted.'
  }

  if (context === 'preprocess') {
    return 'Could not process the image. Make sure it is a valid PNG or JPEG.'
  }

  if (context === 'inference') {
    return 'Analysis failed. This may be a temporary issue — try again.'
  }

  return toErrorMessage(error)
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    window.clearTimeout(timeoutId)
  }
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

function tick(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
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
  const initializedRef = useRef(false)

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
    if (initializedRef.current) {
      return
    }
    initializedRef.current = true

    let isCancelled = false

    const initialize = async (): Promise<void> => {
      try {
        const slug = localStorage.getItem(LOCAL_STORAGE_MODEL_KEY) ?? DEFAULT_MODEL_SLUG
        addLog('info', `Initializing model: ${slug}`)
        setStatus('loading_manifest')
        setError(null)
        await tick()

        let apiClarityUrl: string | null = null
        let apiOnnxUrl: string | null = null

        try {
          const detail = await fetchModelBySlug(slug)
          const currentVersion = detail.current_version

          if (currentVersion?.clarity_url && currentVersion.clarity_url.trim().length > 0) {
            apiClarityUrl = currentVersion.clarity_url
          }

          if (currentVersion?.onnx_url && currentVersion.onnx_url.trim().length > 0) {
            apiOnnxUrl = currentVersion.onnx_url
          }
        } catch (err) {
          if (err instanceof BackendError) {
            if (err.statusCode === 404) {
              addLog('warn', `Model '${slug}' not found in platform, trying local spec`)
            } else {
              addLog('warn', `API unavailable: ${err.message}, trying local spec`)
            }
          } else {
            addLog('warn', `API unavailable: ${toErrorMessage(err)}, trying local spec`)
          }
        }

        if (isCancelled) {
          return
        }

        setStatus('loading_spec')
        addLog('info', 'Loading model specification...')
        await tick()

        let specJson: unknown

        if (apiClarityUrl) {
          try {
            specJson = await fetchJsonWithTimeout(apiClarityUrl, 15000)
          } catch {
            addLog('warn', 'Using local spec — API not available')
            specJson = await fetchJsonWithTimeout(LOCAL_SPEC_FALLBACK_URL, 15000)
          }
        } else {
          addLog('warn', 'Using local spec — API not available')
          specJson = await fetchJsonWithTimeout(LOCAL_SPEC_FALLBACK_URL, 15000)
        }

        const spec = validateSpec(specJson)

        if (isCancelled) {
          return
        }

        specRef.current = spec
        setModelInfo(toModelInfo(spec))
        addLog('info', `Spec loaded: ${spec.id} v${spec.version}`)
        addLog('info', `Classes: ${spec.output.classes.join(' · ')}`)

        const modelUrl = apiOnnxUrl && apiOnnxUrl.trim().length > 0
          ? apiOnnxUrl
          : LOCAL_MODEL_FALLBACK_URL
        modelUrlRef.current = modelUrl

        setStatus('downloading_model')
        addLog('info', 'Checking model cache...')
        await tick()

        const cacheStore = await caches.open(MODEL_CACHE_NAME)
        const cacheMatch = await cacheStore.match(modelUrl)
        let modelBuffer: ArrayBuffer

        if (cacheMatch) {
          addLog('info', 'Model loaded from cache')
          modelBuffer = await cacheMatch.arrayBuffer()
        } else {
          addLog('info', 'Downloading model... (this may take a moment)')

          const controller = new AbortController()
          const timeoutId = window.setTimeout(() => controller.abort(), 45000)
          let modelResponse: Response

          try {
            modelResponse = await fetch(modelUrl, { signal: controller.signal })
          } finally {
            window.clearTimeout(timeoutId)
          }

          if (!modelResponse.ok) {
            throw new Error(`Failed to download model: HTTP ${modelResponse.status}`)
          }

          modelBuffer = await modelResponse.arrayBuffer()
          await cacheStore.put(
            modelUrl,
            new Response(modelBuffer, {
              headers: { 'Content-Type': 'application/octet-stream' },
            })
          )

          addLog('info', `Model downloaded: ${(modelBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`)
        }

        if (isCancelled) {
          return
        }

        setStatus('verifying_model')
        addLog('info', 'Verifying model...')
        await tick()

        const expectedHash = spec.integrity?.sha256
        if (expectedHash) {
          const actualHash = await sha256(modelBuffer)
          if (actualHash !== expectedHash.toLowerCase()) {
            throw new Error('Model integrity check failed — file may be corrupted')
          }
          addLog('success', 'Integrity verified')
        } else {
          addLog('warn', 'No integrity hash in spec — skipping verification')
        }

        let reloadedCacheMatch: Response | undefined
        try {
          reloadedCacheMatch = await cacheStore.match(modelUrl)
        } catch {
          reloadedCacheMatch = undefined
        }

        const modelBytes = reloadedCacheMatch ? await reloadedCacheMatch.arrayBuffer() : modelBuffer
        const modelArray = new Uint8Array(modelBytes)
        const sessionKey = getSessionKey(spec)

        if (!sessionCache.has(sessionKey)) {
          const session = await ort.InferenceSession.create(modelArray)
          sessionCache.set(sessionKey, session)
          runtimeSessionCache.set(spec.id, session)
        }

        if (!isCancelled) {
          setStatus('ready')
          addLog('success', 'System ready — upload a scan to analyze')
        }
      } catch (err) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : 'Initialization failed'
          const friendly =
            message.toLowerCase().includes('timed out') || message.toLowerCase().includes('abort')
              ? mapFriendlyError('timeout', err)
              : message.toLowerCase().includes('cache')
                ? mapFriendlyError('cache', err)
                : message.toLowerCase().includes('download')
                  ? mapFriendlyError('network', err)
                  : message.toLowerCase().includes('integrity')
                    ? message
                    : message.toLowerCase().includes('model specification') || message.toLowerCase().includes('invalid')
                      ? message
                      : mapFriendlyError('onnx-load', err)

          setStatus('error')
          setError(friendly)
          addLog('error', friendly)
        }
      }
    }

    void initialize()

    return () => {
      isCancelled = true
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
    addLog('info', `Analysis started: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`)

    try {
      const sessionKey = getSessionKey(spec)
      if (!sessionCache.has(sessionKey)) {
        const modelUrl = modelUrlRef.current
        if (!modelUrl) {
          throw new Error('Model is not initialized')
        }

        const cacheStore = await caches.open(MODEL_CACHE_NAME)
        const cached = await cacheStore.match(modelUrl)
        if (!cached) {
          throw new Error('Model cache miss')
        }

        const modelBytes = await cached.arrayBuffer()
        const modelArray = new Uint8Array(modelBytes)
        const session = await ort.InferenceSession.create(modelArray)
        sessionCache.set(sessionKey, session)
        runtimeSessionCache.set(spec.id, session)
      }

      addLog('info', 'Preprocessing image...')
      const tensor = await preprocessImage(file, spec)
      addLog('info', 'Image preprocessed')

      addLog('info', 'Running inference...')
      const startTime = Date.now()
      const rawOutput = await runInference(tensor, spec)
      const elapsed = Date.now() - startTime
      addLog('info', `Inference complete in ${elapsed}ms`)

      const safeResult = postprocess(rawOutput, spec)

      setResult(safeResult)
      setStatus('complete')
      addLog('success', `Finding: ${safeResult.primaryFinding} (${safeResult.confidencePercent}%)`)

      const tierText = {
        possible_finding: '⚠ Possible finding detected',
        low_confidence: '○ Low confidence result',
        no_finding: '✓ No finding detected',
      }[safeResult.safetyTier] ?? safeResult.safetyTier

      addLog('info', tierText)
    } catch (runErr) {
      const baseMessage = toErrorMessage(runErr)

      let context: HookErrorContext = 'generic'
      if (baseMessage.toLowerCase().includes('preprocess') || baseMessage.toLowerCase().includes('decode image')) {
        context = 'preprocess'
      } else if (baseMessage.toLowerCase().includes('quotaexceedederror')) {
        context = 'cache'
      } else if (baseMessage.toLowerCase().includes('failed to fetch') || baseMessage.toLowerCase().includes('network')) {
        context = 'network'
      } else {
        context = 'inference'
      }

      const message = mapFriendlyError(context, runErr)
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
