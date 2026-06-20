/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web'

// Single-threaded WASM inside the worker — outer thread already provides concurrency
ort.env.wasm.numThreads = 1
ort.env.wasm.simd = true

const sessions = new Map<string, ort.InferenceSession>()

interface LoadModelMsg {
  type: 'LOAD_MODEL'
  id: string
  specId: string
  modelBuffer: ArrayBuffer
}

interface RunInferenceMsg {
  type: 'RUN_INFERENCE'
  id: string
  specId: string
  imageData: Float32Array
  inputShape: number[]
  inputName: string
  outputName: string
}

type InMsg = LoadModelMsg | RunInferenceMsg

const ctx = self as DedicatedWorkerGlobalScope

ctx.addEventListener('message', async (event: MessageEvent<InMsg>) => {
  const msg = event.data

  try {
    if (msg.type === 'LOAD_MODEL') {
      const { id, specId, modelBuffer } = msg
      const session = await ort.InferenceSession.create(new Uint8Array(modelBuffer))
      sessions.set(specId, session)
      ctx.postMessage({ type: 'LOADED', id })
      return
    }

    if (msg.type === 'RUN_INFERENCE') {
      const { id, specId, imageData, inputShape, inputName, outputName } = msg
      const session = sessions.get(specId)

      if (!session) {
        ctx.postMessage({ type: 'ERROR', id, error: `No session loaded for model "${specId}"` })
        return
      }

      const tensor = new ort.Tensor('float32', imageData, inputShape)
      const outputs = await session.run({ [inputName]: tensor })

      const preferredOut = outputs[outputName]
      const fallbackKey = Object.keys(outputs)[0]
      const outTensor = preferredOut ?? (fallbackKey ? outputs[fallbackKey] : undefined)

      if (!outTensor) {
        ctx.postMessage({ type: 'ERROR', id, error: 'Model run returned no output tensors' })
        return
      }

      const raw = outTensor.data
      const result = raw instanceof Float32Array ? raw : Float32Array.from(raw as ArrayLike<number>)
      ctx.postMessage({ type: 'RESULT', id, result }, [result.buffer])
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Inference worker error'
    ctx.postMessage({ type: 'ERROR', id: msg.id, error })
  }
})
