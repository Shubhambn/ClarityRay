# ClarityRay — Agent Context

## What This Product Is

ClarityRay is a browser-only chest X-ray screening tool.
Medical inference runs entirely client-side using ONNX Runtime Web.
No patient data ever leaves the user's device.

It is also a model platform: researchers convert trained ONNX models
using the clarityray-converter pip package and submit them to a model library.

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