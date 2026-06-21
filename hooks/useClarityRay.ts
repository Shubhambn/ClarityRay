'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchManifest, getCurrentModel } from '@/lib/clarity/manifest'
import { loadModel } from '@/lib/clarity/loader'
import { postprocess, type SafeResult } from '@/lib/clarity/postprocess'
import { preprocessImage } from '@/lib/clarity/preprocess'
import { runInference, hasSession, loadModelInWorker } from '@/lib/clarity/run'
import {
  transition,
  canTransition,
  type ClarityRayStatus,
  type ClarityRayEvent,
} from '@/lib/clarity/stateMachine'
import { fetchSpec } from '@/lib/clarity/specLoader'
import { type ClaritySpec, type ClarityTask, validateSpec } from '@/lib/clarity/types'

export type { ClarityRayStatus }

export interface ModelInfo {
  id: string
  name: string
  version: string
  task: ClarityTask
  inputShape: number[]
  outputClasses: string[]
  activation: ClaritySpec['output']['activation']
  bodypart: string
  modality: string
  thresholds?: {
    possible_finding?: number
    low_confidence?: number
    validation_status?: string
  }
  sourceModel?: {
    family: string
    source: string
    selected_findings?: string[]
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

function toModelInfo(spec: ClaritySpec): ModelInfo {
  return {
    id: spec.id,
    name: spec.name,
    version: spec.version,
    task: spec.output.task ?? 'binary',
    inputShape: spec.input.shape,
    outputClasses: spec.output.classes,
    activation: spec.output.activation,
    bodypart: spec.bodypart,
    modality: spec.modality,
    thresholds: {
      possible_finding: spec.thresholds.possible_finding,
      low_confidence: spec.thresholds.low_confidence,
      validation_status: spec.thresholds.validation_status,
    },
    ...(spec.source_model ? { sourceModel: spec.source_model } : {}),
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

  // State machine dispatch — all status transitions go through here
  const dispatch = useCallback((event: ClarityRayEvent): void => {
    setStatus((prev) => transition(prev, event))
  }, [])

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

        dispatch('INIT')
        addLog('info', 'Fetching model manifest...')
        await _tick()
        const manifest = await fetchManifest()
        const manifestModel = manifest.models[preferredModel]
          ? manifest.models[preferredModel]
          : getCurrentModel(manifest)
        const selectedModelId = manifest.models[preferredModel] ? preferredModel : manifest.current_model
        addLog('info', `Manifest loaded — model: ${selectedModelId}`)

        if (cancelled) return
        dispatch('MANIFEST_OK')

        addLog('info', 'Fetching clarity.json spec...')
        await _tick()
        const spec = await fetchSpec(manifestModel.spec_url)
        addLog('info', `Spec validated — input shape: ${spec.input.shape.join('×')}`)

        if (cancelled) return

        specRef.current = validateSpec(spec)
        setModelInfo(toModelInfo(spec))
        modelUrlRef.current = manifestModel.url
        dispatch('SPEC_OK')

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
        dispatch('DOWNLOAD_OK')

        addLog('info', 'Verifying model integrity...')
        await _tick()

        if (integritySkipped) {
          addLog('warn', 'No integrity hash in spec — skipping verification')
        } else {
          addLog('success', 'Integrity verified ✓')
        }

        if (cancelled) return

        if (!hasSession(spec.id)) {
          await loadModelInWorker(modelBuffer, spec.id)
        }

        if (!cancelled) {
          dispatch('VERIFY_OK')
          addLog('success', 'System ready — upload a scan to analyze')
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Initialization failed'
          dispatch('FAIL')
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
  }, [addLog, dispatch, reinitToken])

  const runAnalysis = useCallback(async (file: File): Promise<void> => {
    if (!canTransition(statusRef.current, 'ANALYZE')) {
      return
    }

    const spec = specRef.current
    if (!spec || !modelInfo) {
      addLog('error', 'Model spec not loaded — cannot analyze')
      return
    }

    dispatch('ANALYZE')
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
      dispatch('INFER_OK')
      addLog('success', `Finding: ${nextResult.primaryFinding} (${nextResult.confidencePercent}%)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      dispatch('FAIL')
      setError(message)
      addLog('error', message)
    }
  }, [addLog, dispatch, modelInfo])

  const reset = useCallback((): void => {
    setResult(null)
    setError(null)

    const spec = specRef.current
    if (spec && hasSession(spec.id)) {
      dispatch('RESET_READY')
      return
    }

    dispatch('RESET')
  }, [dispatch])

  const retryInit = useCallback((): void => {
    setResult(null)
    setError(null)
    dispatch('RETRY')
    setReinitToken((t) => t + 1)
  }, [dispatch])

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
