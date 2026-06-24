'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchManifest, getCurrentModel } from '@/lib/clarity/manifest'
import { loadModel } from '@/lib/clarity/loader'
import { postprocess, type SafeResult, type HeatmapData } from '@/lib/clarity/postprocess'
import { preprocessImage } from '@/lib/clarity/preprocess'
import { runInference, hasSession, loadModelInWorker } from '@/lib/clarity/run'
import { generateOcclusionHeatmap } from '@/lib/clarity/occlusion'
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
  explainability?: {
    enabled: boolean
    method: string
    disclaimer: string
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
    ...(spec.explainability ? { explainability: spec.explainability } : {}),
  }
}

const explanationCache = new Map<string, HeatmapData>()

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

  const [explanationProgress, setExplanationProgress] = useState<number | null>(null)
  const [explanationResult, setExplanationResult] = useState<HeatmapData | null>(null)
  const [explanationActive, setExplanationActive] = useState<boolean>(false)

  const statusRef = useRef<ClarityRayStatus>('idle')
  const specRef = useRef<ClaritySpec | null>(null)
  const modelUrlRef = useRef<string | null>(null)
  const occlusionAbortControllerRef = useRef<AbortController | null>(null)

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (occlusionAbortControllerRef.current) {
        occlusionAbortControllerRef.current.abort()
      }
    }
  }, [])

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
          await loadModelInWorker(modelBuffer, spec.id, modelUrlRef.current ?? undefined)
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

    // Cancel any active occlusion generation run
    if (occlusionAbortControllerRef.current) {
      occlusionAbortControllerRef.current.abort()
      occlusionAbortControllerRef.current = null
    }

    dispatch('ANALYZE')
    setResult(null)
    setError(null)
    setExplanationResult(null)
    setExplanationProgress(null)
    setExplanationActive(false)
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

      if (spec.explainability?.enabled) {
        const cacheKey = `${spec.id}:${file.name}:${file.size}:${file.lastModified}`
        const cached = explanationCache.get(cacheKey)

        if (cached) {
          setExplanationResult(cached)
          addLog('success', 'Model-based explanation loaded from cache')
        } else {
          setExplanationActive(true)
          setExplanationProgress(0)
          addLog('info', 'Generating model-based explanation...')

          const controller = new AbortController()
          occlusionAbortControllerRef.current = controller

          void (async () => {
            try {
              let targetClassIndex = -1
              const primaryFindingClean = nextResult.primaryFinding.toLowerCase()

              targetClassIndex = spec.output.classes.findIndex(
                (c) => c.toLowerCase() === primaryFindingClean
              )

              if (targetClassIndex === -1) {
                targetClassIndex = spec.output.classes.findIndex(
                  (c) =>
                    primaryFindingClean.includes(c.toLowerCase()) ||
                    c.toLowerCase().includes(primaryFindingClean)
                )
              }

              if (targetClassIndex === -1) {
                let maxProb = -1
                let bestIdx = 0
                nextResult.classProbabilities.forEach((item) => {
                  if (item.probability > maxProb) {
                    maxProb = item.probability
                    bestIdx = spec.output.classes.indexOf(item.label)
                  }
                })
                targetClassIndex = bestIdx >= 0 ? bestIdx : 0
              }

              const heatmap = await generateOcclusionHeatmap(tensor, spec, targetClassIndex, {
                gridSize: 12,
                abortSignal: controller.signal,
                onProgress: (p) => {
                  setExplanationProgress(p)
                },
              })

              explanationCache.set(cacheKey, heatmap)
              setExplanationResult(heatmap)
              setExplanationActive(false)
              setExplanationProgress(null)
              addLog('success', 'Model-based explanation generated successfully')
            } catch (err) {
              if (err instanceof Error && err.message.includes('aborted')) {
                // User aborted or run was reset, ignore or log silently
              } else {
                const msg = err instanceof Error ? err.message : 'Explanation failed'
                addLog('warn', `Explanation generation skipped: ${msg}`)
                setExplanationActive(false)
                setExplanationProgress(null)
              }
            } finally {
              if (occlusionAbortControllerRef.current === controller) {
                occlusionAbortControllerRef.current = null
              }
            }
          })()
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      dispatch('FAIL')
      setError(message)
      addLog('error', message)
    }
  }, [addLog, dispatch, modelInfo])

  const reset = useCallback((): void => {
    if (occlusionAbortControllerRef.current) {
      occlusionAbortControllerRef.current.abort()
      occlusionAbortControllerRef.current = null
    }
    setResult(null)
    setError(null)
    setExplanationResult(null)
    setExplanationProgress(null)
    setExplanationActive(false)

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
    setLogs([])
    dispatch('RETRY')
    setReinitToken((t) => t + 1)
  }, [dispatch])

  const cancelExplanation = useCallback((): void => {
    if (occlusionAbortControllerRef.current) {
      occlusionAbortControllerRef.current.abort()
      occlusionAbortControllerRef.current = null
      setExplanationActive(false)
      setExplanationProgress(null)
      addLog('info', 'Occlusion sensitivity run cancelled by user')
    }
  }, [addLog])

  return {
    status,
    result,
    error,
    modelInfo,
    logs,
    runAnalysis,
    reset,
    retryInit,
    explanationProgress,
    explanationResult,
    explanationActive,
    cancelExplanation,
  }
}
