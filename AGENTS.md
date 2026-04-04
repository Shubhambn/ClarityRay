# ClarityRay — Agent Context

## What This Product Is

ClarityRay is a browser-only chest X-ray screening tool.
Medical inference runs entirely client-side using ONNX Runtime Web.
No patient data ever leaves the user's device.

It is also a model platform: researchers convert trained ONNX models
using the converter package and submit them to a model library.

## Core Invariant — Never Break This

Patient data (scan images) NEVER leaves the browser.
Inference ALWAYS runs locally via ONNX Runtime Web.

If you are about to write a fetch() call that sends image data to a server — stop.
That is the one change that is never acceptable regardless of the reason.

## Active Code

  app/analysis/page.tsx         active analysis page
  hooks/useClarityRay.ts        active inference hook
  lib/models/chestXray/*        active ONNX pipeline (pre-Phase 3)
  lib/clarity/*                 generic runtime (Phase 3+)
  components/UploadZone.tsx     active
  components/ResultsPanel.tsx   active
  components/GradCAMViewer.tsx  active
  components/ConsentModal.tsx   active

## Dead Code — Do Not Wire Up

  backend/                      retired Express backend. Do not reference in new code.
  utils/api.ts                  do not import in app/analysis/page.tsx
  utils/auth.ts                 do not import in app/analysis/page.tsx
  src/app/*                     Next.js scaffold, not the active route tree
  pages/                        documentation only

The active route tree is the top-level app/ directory, not src/app/.

## Current ONNX Model

  File:         /public/chestxray_densenet121.onnx
  Output shape: [1, 2]  — TWO classes only
  Classes:      ["Normal", "Lung Cancer"]
  Output type:  raw logits — softmax must be applied in postprocess.ts
  Input shape:  [1, 3, 224, 224]
  Normalize:    ImageNet mean [0.485, 0.456, 0.406] std [0.229, 0.224, 0.225]

  This is NOT the standard 14-class NIH ChestX-ray14 model.
  Never assume 14 output classes.

## Commands

  npm run dev          start Next.js on port 3000
  npm run dev:api      start Express backend (not used in active product)
  npx tsc --noEmit     type check — run after every change
  npm run build        production build

  cd converter
  pip install -e ".[pytorch]"
  clarityray --help

## Required Server Headers

ONNX Runtime Web requires SharedArrayBuffer.
These headers must be present in next.config.ts:

  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

Do not remove them. Do not add cross-origin third-party scripts.

## Forbidden Patterns

1. No fetch() sending image/scan data to any server
2. No server-side inference
3. No import of utils/api.ts or utils/auth.ts in app/analysis/page.tsx
4. Never use in user-facing strings:
  direct diagnosis claims / definitive finding claims / direct patient-disease statements
  use approved screening-safe wording only
5. Do not modify /public/chestxray_densenet121.onnx
6. Do not set certified: true in any clarity.json
7. After Phase 3: no hardcoded model paths, label arrays,
   or normalization constants outside of a clarity.json file

## TypeScript Rules

Strict mode is enabled. Run npx tsc --noEmit after every change.
No 'any' type. No type assertions (as X) unless absolutely necessary.
All new files in lib/clarity/ must be fully typed with no implicit any.

## Safety Language Rules

All user-facing result text must use:
  "possible finding detected" for positive-screen messaging
  "no finding detected" for no-finding messaging
  "possible finding" instead of definitive language
  "may suggest"                not  "confirms" or "shows"

The disclaimer and plain summary text in translateResults() must not be changed
without also updating the SafeResult interface.

## Threshold Values

Thresholds (possible_finding, low_confidence) live in clarity.json.
They are NOT hardcoded in postprocess.ts.
Default values: possible_finding: 0.5, low_confidence: 0.25,"validation_status": "unvalidated"
These defaults are reasonable but unvalidated.
Each model's clarity.json should declare its own validated thresholds
based on testing against real data.


## Persona System

  lib/persona/context.tsx       PersonaContext + usePersona() hook
  Storage key:                  localStorage 'clarityray_persona_v1'
  Valid values:                 'researcher' | 'doctor' | 'patient' | null
  null means:                   persona not set, show onboarding prompt
  
  Researcher view shows:        raw probabilities, thresholds, technical metadata, full logs
  Doctor view shows:            clinical framing, confidence, interpretation, probability bars
  Patient view shows:           plain language only — hide all technical data

  Never show raw probabilities or threshold values to 'patient' persona.
  Never show definitive diagnosis language to any persona.


  ## Active Code (updated)

  app/page.tsx                        landing page
  app/onboarding/page.tsx             persona setup + consent flow
  app/about/page.tsx                  system explanation page
  app/analysis/page.tsx               active analysis page
  app/models/page.tsx                 model browser
  app/models/[slug]/page.tsx          model detail + selection
  app/not-found.tsx                   custom 404
  app/error.tsx                       error boundary page
  
  hooks/useClarityRay.ts              active inference hook
  lib/persona/context.tsx             persona state — NEW
  lib/clarity/*                       generic runtime (Phase 3+)
  
  components/nav/TopBar.tsx           global navigation — NEW
  components/analysis/ControlPanel.tsx  left panel — NEW
  components/analysis/ScanViewer.tsx    center image panel — NEW
  components/analysis/SystemPanel.tsx   persona-aware result panel — NEW
  components/analysis/LogPanel.tsx      real system log display — NEW
  components/models/ModelCard.tsx       model browser card — NEW
  components/ConsentModal.tsx           consent gate
  components/UploadZone.tsx             active
  components/ResultsPanel.tsx           active
  components/GradCAMViewer.tsx          active


  ## Design System

All styling uses CSS custom properties defined in app/globals.css.
Never hardcode colors, spacing, or font values in component files.
Use var(--token-name) everywhere.

Key tokens:
  --bg-base: #000000              page background
  --accent-primary: #22c55e       green — the only brand color
  --text-primary: #f9fafb         main text
  --text-secondary: #9ca3af       secondary text
  --text-mono: #86efac            monospace text color
  --border-subtle: rgba(255,255,255,0.06)
  --border-accent: rgba(34,197,94,0.25)
  --font-ui: 'DM Sans'            all UI text
  --font-mono: 'DM Mono'          system logs, metrics, labels, badges

Classes defined in globals.css (use these, do not recreate):
  .grid-bg       dark grid overlay background
  .scanlines     fixed scanline overlay (pointer-events: none)
  .vignette      fixed radial vignette overlay
  .panel         base panel styling
  .panel-accent  panel with green accent border
  .status-dot    6px pulsing green indicator dot
  .mono          DM Mono text shorthand

Never:
  Add gradient backgrounds
  Add box shadows except for focus rings
  Use white or light backgrounds anywhere
  Use fonts other than DM Sans and DM Mono
  Use colors not from the token system


  ## Hook Contract — useClarityRay

Required return shape (do not change without updating all consumers):

  status: ClarityRayStatus
  result: SafeResult | null
  error: string | null
  modelInfo: { id, name, version, inputShape, outputClasses, bodypart, modality } | null
  logs: SystemLog[]
  runAnalysis: (file: File) => Promise<void>
  reset: () => void

Status values (exact — do not add or remove):
  'idle' | 'loading_manifest' | 'loading_spec' | 'downloading_model'
  | 'verifying_model' | 'ready' | 'processing' | 'complete' | 'error'

Log type:
  { id: string, timestamp: Date, level: 'info'|'warn'|'error'|'success', message: string }

integrity.sha256 in spec is OPTIONAL.
If absent: log a warning and continue. Do NOT fail model loading.
If present: compute SHA-256 and compare. Fail if mismatch.

## Additional Forbidden Patterns (added)

8.  No fake logs or simulated system events in LogPanel
    → Show only real SystemLog[] entries from the hook

9.  No hardcoded persona-specific text in shared components
    → Read persona from usePersona() hook and derive text from it

10. No fake animation loops or artificial delays in analysis flow
    → Map real status values to UI states only

11. Never show raw probabilities or threshold values to 'patient' persona
    → Gate technical data behind persona === 'researcher' || persona === 'doctor'

12. TopBar must always show the privacy indicator ('Local' badge)
    → This is a non-negotiable trust signal, not a toggleable feature

13. Consent must be checked on every /analysis mount
    → Check localStorage 'clarityray_consent_v1' === 'accepted' on every load
    → If absent: show ConsentModal. If user navigated away and came back: check again.