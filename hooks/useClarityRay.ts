'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as ort from 'onnxruntime-web'

import { fetchManifest, getCurrentModel } from '@/lib/clarity/manifest'
import { loadModel } from '@/lib/clarity/loader'
import { postprocess, type SafeResult } from '@/lib/clarity/postprocess'
import { preprocessImage } from '@/lib/clarity/preprocess'
import { runInference, sessionCache, hasSession } from '@/lib/clarity/run'
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
  const [reinitToken, setReinitToken] = useState(0)

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
    const controller = new AbortController()

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

        if (cancelled) return

        setStatus('loading_spec')
        addLog('info', 'Fetching clarity.json spec...')
        await _tick()
        const spec = await fetchSpec(manifestModel.spec_url)
        addLog('info', `Spec validated — input shape: ${spec.input.shape.join('×')}`)

        if (cancelled) return

        specRef.current = validateSpec(spec)
        setModelInfo(toModelInfo(spec))
        modelUrlRef.current = manifestModel.url

        setStatus('downloading_model')
        addLog('info', 'Checking local cache for model binary...')
        await _tick()

        const { buffer: modelBuffer, integritySkipped } = await loadModel(
          manifestModel.url,
          spec,
          {
            signal: controller.signal,
            onProgress: (bytesLoaded, bytesTotal) => {
              if (cancelled) return
              if (bytesTotal > 0) {
                const pct = Math.round((bytesLoaded / bytesTotal) * 100)
                addLog('info', `Downloading model... ${pct}%`)
              } else {
                const mb = (bytesLoaded / (1024 * 1024)).toFixed(1)
                addLog('info', `Downloading model... ${mb} MB`)
              }
            },
          }
        )

        if (cancelled) return

        setStatus('verifying_model')
        addLog('info', 'Verifying model integrity...')
        await _tick()

        if (integritySkipped) {
          addLog('warn', 'No integrity hash in spec — skipping verification')
        } else {
          addLog('success', 'Integrity verified ✓')
        }

        if (cancelled) return

        if (!hasSession(spec.id)) {
          const session = await createInferenceSession(modelBuffer)
          sessionCache.set(spec.id, session)
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
      controller.abort()
    }
  }, [addLog, reinitToken])

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
    if (spec && hasSession(spec.id)) {
      setStatus('ready')
      return
    }

    setStatus('idle')
  }, [])

  const retryInit = useCallback((): void => {
    setResult(null)
    setError(null)
    setReinitToken((t) => t + 1)
  }, [])

  return {
    status,
    result,
    error,
    modelInfo,
    logs,
    runAnalysis,
    reset,
    retryInit,
  }
}
