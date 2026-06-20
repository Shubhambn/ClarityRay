/**
 * Lightweight deterministic state machine for the ClarityRay init/analysis pipeline.
 *
 * Benefits over ad-hoc setStatus() calls:
 *  - Invalid transitions are silently ignored (no impossible states)
 *  - Every valid path through the system is enumerated in one place
 *  - Unit-testable without React
 */

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

export type ClarityRayEvent =
  | 'INIT'          // Start initialisation sequence
  | 'MANIFEST_OK'   // Manifest loaded
  | 'SPEC_OK'       // Spec loaded and validated
  | 'DOWNLOAD_OK'   // Model binary downloaded
  | 'VERIFY_OK'     // Integrity verification passed (or skipped)
  | 'ANALYZE'       // User submits an image for analysis
  | 'INFER_OK'      // Inference + postprocessing completed
  | 'RESET'         // Return to idle (session not loaded)
  | 'RESET_READY'   // Return to ready (session already in worker)
  | 'RETRY'         // Retry initialisation after error
  | 'FAIL'          // Any step failed — transition to error

type TransitionMap = Partial<Record<ClarityRayStatus, Partial<Record<ClarityRayEvent, ClarityRayStatus>>>>

const TRANSITIONS: TransitionMap = {
  idle:              { INIT:        'loading_manifest' },
  loading_manifest:  { MANIFEST_OK: 'loading_spec',      FAIL: 'error' },
  loading_spec:      { SPEC_OK:     'downloading_model', FAIL: 'error' },
  downloading_model: { DOWNLOAD_OK: 'verifying_model',   FAIL: 'error' },
  verifying_model:   { VERIFY_OK:   'ready',             FAIL: 'error' },
  ready:             { ANALYZE:     'processing',        RESET: 'idle' },
  processing:        { INFER_OK:    'complete',          FAIL:  'error', RESET_READY: 'ready' },
  complete:          { ANALYZE:     'processing',        RESET: 'idle', RESET_READY: 'ready' },
  error:             { RETRY:       'idle',              RESET: 'idle', RESET_READY: 'ready' },
}

/**
 * Returns the next status for a given (current, event) pair.
 * If the transition is invalid, returns `current` unchanged and warns in dev.
 */
export function transition(current: ClarityRayStatus, event: ClarityRayEvent): ClarityRayStatus {
  const next = TRANSITIONS[current]?.[event]
  if (!next) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[ClarityRay SM] invalid transition: ${current} + ${event} — ignored`)
    }
    return current
  }
  return next
}

/** Returns true when the event is valid from the current state. */
export function canTransition(current: ClarityRayStatus, event: ClarityRayEvent): boolean {
  return Boolean(TRANSITIONS[current]?.[event])
}
