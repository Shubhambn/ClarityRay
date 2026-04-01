# ClarityRay — Current Implementation Context

Last updated: 2026-03-30

## MVP Contract (Enforced)

- Single model: `public/chestxray_densenet121.onnx`
- Browser-only inference via `onnxruntime-web`
- Input tensor shape: `[1, 3, 224, 224]`
- Output shape: `[1, 2]` logits
- Labels: `Normal`, `Lung Cancer`
- No backend/API/database/auth
- GradCAM viewer is mock overlay only (no gradients)

## Current Pipeline

`UploadZone -> useClarityRay -> preprocessImage -> runModel -> postprocessOutput -> ResultsPanel`

## What Was Fixed In This Pass

1. **Label alignment fixed**
   - Removed old 14-class labels.
   - Enforced 2-class labels in `lib/models/chestXray/config.ts`.

2. **Softmax added**
   - `postprocess.ts` now converts logits to probabilities with numerically stable softmax.

3. **Runtime hardening**
   - Model loads from `/chestxray_densenet121.onnx`.
   - Dynamic input/output names are used.
   - Browser/WebAssembly checks and user-safe error messages added.

4. **Hook flow improved**
   - Added statuses: `idle | loading_model | running | complete | error`.
   - Added clean error handling and max file size guard (10MB).
   - Full client-side pipeline is enforced.

5. **UI flow fixed**
   - Analyze button disabled until file selection.
   - Loading messages: “Loading AI model...” and “Running analysis...”.
   - Disclaimer shown in results panel at all times.

6. **TypeScript import path fix**
   - Updated `tsconfig.json` alias to resolve both root and `src` paths.

## Remaining Validation (In Progress)

- Run linter/type checks and fix any residual compile issues.
- Run production build and verify no route conflicts.
- Confirm upload -> analyze -> result flow end-to-end.

## Safety Copy Baseline

- “This is a screening tool, not a diagnosis.”
- “Possible finding” / “may indicate” wording only.
- “Consult a qualified physician” included in disclaimer.
