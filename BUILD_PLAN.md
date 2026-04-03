# ClarityRay — Brutally Minimal Build Plan
## "Medical AI that runs on your machine."
### Version 3.0 | Scope Cut 70% | Multi-AI Workflow

---

# THE REALITY CHECK FIRST

## What The Website Actually Shows

ClarityRay is NOT a general ML platform.
It is ONE specific thing:

```
Upload chest X-ray → DenseNet121 runs locally → Get findings + GradCAM map
```

That's it. That's the entire product.

Everything else — CLI, 15 models, marketplace, sandbox framework,
packaging standard — was architecture astronautics.

The landing page already shows the real MVP:
  ✓ ONE model (DenseNet121 on NIH ChestX-ray14)
  ✓ ONE input type (JPEG / PNG / DICOM)
  ✓ ONE output type (findings + confidence + attention map)
  ✓ ONE promise (runs locally, no data leaves device)
  ✓ ONE audience (doctors, clinicians, researchers)

---

# PART 1 — WHAT TO CUT (70% GONE)

```
❌ REMOVE COMPLETELY FROM V1
─────────────────────────────────────────────────────────────────
❌ CLI tool (clarityray validate / run / pack)
❌ clarity.json spec and packaging standard
❌ 15 Document AI models
❌ Model marketplace / library
❌ Per-model venv management
❌ 7-step validation pipeline for third-party models
❌ GitHub / HuggingFace ingestion
❌ Full sandbox framework (ulimits, seccomp, etc.)
❌ Tauri desktop app (for now — web first)
❌ Bundled Python runtime
❌ Job queue worker (SQLite-backed async queue)
❌ Multi-model architecture
❌ Output renderer framework
❌ Developer portal
❌ Batch processing
❌ Auto-updater

✓ WHAT REMAINS (THE REAL V1)
─────────────────────────────────────────────────────────────────
✓ ONE model: DenseNet121 (chest X-ray classification)
✓ ONE input: JPEG / PNG / DICOM upload
✓ ONE output: findings list + confidence scores + GradCAM overlay
✓ Web app (runs in browser, model runs in-browser via ONNX)
✓ Zero server (pure client-side — data truly never leaves device)
✓ Plain-language result translation
✓ Mandatory disclaimer on every result
```

---

# PART 2 — THE REAL MINIMUM VIABLE PRODUCT

## The Single Screen That Ships

```
┌─────────────────────────────────────────────────────────────┐
│  ClarityRay                                    [?] About    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         ┌─────────────────────────────────┐                │
│         │                                 │                │
│         │   Drop chest X-ray here         │                │
│         │   JPEG · PNG · DICOM            │                │
│         │                                 │                │
│         │         [Upload Image]          │                │
│         └─────────────────────────────────┘                │
│                                                             │
│         [Run Analysis]  ← disabled until image loaded       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

AFTER RUN:
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │  Original X-ray  │  │ AI Findings                      │ │
│  │                  │  │ ─────────────────────────────    │ │
│  │   [image]        │  │ ● Pulmonary nodule    87%  ████  │ │
│  │                  │  │ ● Pleural effusion    43%  ██    │ │
│  │                  │  │ ● Normal parenchyma   23%  █     │ │
│  └──────────────────┘  │                                  │ │
│  ┌──────────────────┐  │ Primary Finding:                 │ │
│  │  GradCAM Overlay │  │ ABNORMALITY DETECTED             │ │
│  │                  │  │                                  │ │
│  │   [heatmap]      │  │ ⚠ This is a screening tool.     │ │
│  │                  │  │   Not a diagnosis. Consult a     │ │
│  └──────────────────┘  │   qualified physician.           │ │
│                        └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

Two screens. That's the entire product.

---

## The Key Technical Insight: Run In The Browser

The reason to skip the desktop app in V1 is this:

**ONNX Runtime Web runs DenseNet121 entirely in the browser.**

No server. No Python. No installation.
User visits clarityray.vercel.app → uploads image → model runs in their browser tab.
Data never leaves the device because it never hits a server.

This is the purest version of the "no cloud" promise.
And it ships in days, not months.

```
Traditional approach (what was planned):
  User → App download → Install → Python daemon → Model → Result
  Time to first use: 5+ minutes | Build time: 2+ months

Correct V1 approach:
  User → Open URL → Upload image → Result
  Time to first use: 30 seconds | Build time: 2–3 weeks
```

The desktop app becomes V2 — when users want offline capability
after being already convinced by the web version.

---

## Tech Stack (Minimal)

```
Frontend:    Next.js 14 (already on Vercel — this is already set up)
ML Runtime:  ONNX Runtime Web (runs model in browser WebAssembly)
Model:       DenseNet121 → converted to .onnx format (one-time)
GradCAM:     Computed client-side in JavaScript after inference
DICOM:       cornerstone.js or dicom-parser (client-side only)
Storage:     None — no database, no backend, no server
Hosting:     Vercel (free tier — already available)
```

Total backend code: zero lines.
The entire product is a static Next.js app.

---

# PART 3 — THE MULTI-AI TOOL WORKFLOW

## How To Build ClarityRay Using AI Tools

Different AI tools are good at different things.
Use each one for what it does best.
Do not use one tool for everything.

```
TOOL             BEST FOR                        USE IN CLARITYRAY
─────────────────────────────────────────────────────────────────
Claude           Architecture, planning,         Spec docs, system design,
                 complex reasoning,              code review, debugging
                 code review                     complex logic

ChatGPT-4o       Quick code generation,          Boilerplate, UI components,
                 UI components, iteration        quick fixes, ONNX integration

GitHub Copilot   Autocomplete while typing,      Write inference code,
                 in-editor suggestions           GradCAM implementation

Cursor AI        Full-file edits, refactoring,   Refactor components,
                 codebase-aware changes          fix bugs across files

v0 (Vercel)      UI component generation         Generate landing page
                 from description                components, result cards

Perplexity       Research + current docs         Find ONNX model sources,
                 with citations                  DICOM library options

Midjourney/      Visual design assets            App icons, mockup
DALL-E           (NOT code)                      screenshots for landing page
```

---

## Step-by-Step Build Workflow (21 Days)

### WEEK 1: Model + Core Logic
### (Days 1–7)

---

### Day 1 — Get The Model Working
**Tool: ChatGPT-4o + Perplexity**

First task: Get DenseNet121 running and converted to ONNX.
This is the hardest technical step. Do it first.
Everything else is worthless if the model doesn't work.

```
Perplexity prompt:
"Find the best pretrained DenseNet121 model trained on NIH ChestX-ray14
that is available as a PyTorch or TensorFlow checkpoint.
Give me the exact download link and the class labels it outputs."

Expected answer: torchvision.models.densenet121 fine-tuned on ChestX-ray14
14 pathology labels: Atelectasis, Cardiomegaly, Effusion, Infiltration,
Mass, Nodule, Pneumonia, Pneumothorax, Consolidation, Edema,
Emphysema, Fibrosis, Pleural_Thickening, Hernia
```

```
ChatGPT-4o prompt:
"Write Python code to:
1. Load a pretrained DenseNet121 from torchvision
2. Load fine-tuned weights from CheXNet (NIH ChestX-ray14)
3. Export it to ONNX format with input shape [1, 3, 224, 224]
4. Verify the ONNX model runs and outputs 14 probabilities
The output file should be named chestxray14_densenet121.onnx"
```

Verify the ONNX export works. You now have the model file.
This single file is the entire backend of ClarityRay.

---

### Day 2 — ONNX In The Browser
**Tool: ChatGPT-4o + Copilot**

Prove the model runs in a browser before building UI.

```
ChatGPT-4o prompt:
"Write a minimal Next.js page that:
1. Loads onnxruntime-web
2. Loads a model file from /public/model.onnx
3. Takes an image element as input
4. Preprocesses it: resize to 224x224, normalize with ImageNet mean/std
5. Runs inference
6. Returns an array of 14 probabilities
Show me the complete code including the preprocessing pipeline."
```

```javascript
// What you want to end up with — pure client-side inference:
import * as ort from 'onnxruntime-web';

async function runInference(imageElement) {
  const session = await ort.InferenceSession.create('/model.onnx');
  const tensor = preprocessImage(imageElement);  // 1x3x224x224
  const results = await session.run({ input: tensor });
  return Array.from(results.output.data);  // 14 probabilities
}
```

Test this with a sample chest X-ray.
If it produces reasonable probabilities, the hardest part is done.

---

### Day 3 — GradCAM Implementation
**Tool: Claude (complex algorithm) + Copilot (typing)**

GradCAM is the feature that makes ClarityRay visually compelling.
This is algorithmically complex — use Claude for this.

```
Claude prompt:
"I have a DenseNet121 ONNX model running in the browser via onnxruntime-web.
I want to implement GradCAM to generate an attention heatmap.

The challenge: ONNX Runtime Web doesn't expose gradients.

Give me the best practical approach to generate a GradCAM-like
attention visualization for a DenseNet121 chest X-ray model
running in the browser, without access to gradients.

Options I've considered:
1. Grad-CAM++ approximation using activation maps from last conv layer
2. Score-CAM using masked inputs
3. Pre-computing GradCAM on a representative set and interpolating
4. Running a lightweight GradCAM-capable model separately

Which approach is most practical for a browser implementation?
Give me the complete JavaScript implementation of your recommendation."
```

Use Copilot for the actual typing once Claude gives you the approach.

---

### Day 4 — DICOM Support
**Tool: Perplexity (research) + ChatGPT-4o (code)**

```
Perplexity prompt:
"What is the best JavaScript library to parse and render DICOM files
in a browser-only Next.js application in 2025-2026?
Compare: cornerstone.js, dicom-parser, dwv, ohif.
I need: file parsing, pixel data extraction, window/level adjustment.
No server required."
```

```
ChatGPT-4o prompt:
"Using [library from Perplexity answer], write a React component that:
1. Accepts a DICOM file upload
2. Parses the pixel data
3. Renders it as a canvas element
4. Exports a normalized PNG suitable for DenseNet121 inference
Handle both 8-bit and 16-bit DICOM pixel data."
```

---

### Day 5 — Image Preprocessing Pipeline
**Tool: Copilot (in-editor)**

The preprocessing must match exactly what the model was trained on.
Wrong normalization = garbage outputs.

```javascript
// Use Copilot to complete this — it knows ImageNet normalization:
function preprocessImage(canvas) {
  // Resize to 224x224
  // Convert to RGB (handle grayscale X-rays)
  // Normalize: mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
  // Return Float32Array as ONNX tensor shape [1, 3, 224, 224]
}
```

Test with 5 real chest X-ray images.
Verify probabilities are in [0,1] range and sum sensibly.

---

### Day 6 — Plain Language Result Translation
**Tool: Claude**

This is where ClarityRay becomes safe to use.
Raw probabilities are dangerous in medical context.

```
Claude prompt:
"I have a DenseNet121 chest X-ray classifier trained on NIH ChestX-ray14.
It outputs 14 probabilities for pathologies.

Write a JavaScript function that takes these 14 probabilities and returns
a safe, plain-language result object with:
1. Primary finding (the highest confidence pathology above threshold)
2. Secondary findings (other pathologies above a lower threshold)
3. A safety tier: 'possible_finding' | 'no_finding' | 'low_confidence'
4. A mandatory disclaimer appropriate to each safety tier
5. A patient-safe description of the primary finding (no medical jargon)

Important constraints:
- NEVER use language that implies diagnosis
- NEVER use direct patient-disease claim wording
- ALWAYS include 'consult a physician' language
- Threshold calibration: flag as finding only if confidence > 0.3
  (based on NIH ChestX-ray14 paper recommendations)

Return a TypeScript interface and the implementation."
```

---

### Day 7 — Integration Test
**Tool: Cursor AI**

Wire everything together into one working pipeline.

```
Cursor AI prompt (open the project, then):
"I have these separate pieces:
- preprocessImage() in lib/preprocess.ts
- runInference() in lib/inference.ts
- computeGradCAM() in lib/gradcam.ts
- parseDICOM() in lib/dicom.ts
- translateResults() in lib/results.ts

Create a single useClarityRay() React hook that:
1. Takes a File object (JPEG, PNG, or DICOM)
2. Returns {status, findings, heatmapCanvas, disclaimer}
3. Handles loading states and errors
4. Runs entirely client-side

Also create the TypeScript types for all inputs and outputs."
```

By end of Day 7: the core logic works.
Upload image → get findings + heatmap → see plain-language result.
Everything else is UI.

---

### WEEK 2: UI + Integration
### (Days 8–14)

---

### Day 8 — Upload Component
**Tool: v0 by Vercel**

```
v0 prompt:
"Create a React file upload component for a medical imaging app.

Requirements:
- Drag and drop zone with dashed border
- Accepts JPEG, PNG, DICOM files only
- Shows file preview for JPEG/PNG (not DICOM — show filename instead)
- Shows file name, size, and type badge
- Has a clear/remove button
- Has an 'Analyze' button that is disabled until file is loaded
- Clean, medical/clinical aesthetic — minimal, dark background, white text
- No shadows, no gradients — flat and trustworthy
- Tailwind CSS

Do not use any external component libraries."
```

---

### Day 9 — Results Display Component
**Tool: v0 + Claude (for the disclaimer UI)**

```
v0 prompt:
"Create a medical AI results panel component in React/Tailwind.

Shows:
- A list of findings, each with: label, confidence percentage, horizontal bar
- Bars are colored: orange for >70%, yellow for 40-70%, gray for <40%
- A 'Primary Finding' section with larger text
- A disclaimer box at the bottom with warning icon and orange/amber border
- The disclaimer text is passed as a prop
- A 'Download Report' button (just the button, handler passed as prop)

Medical/clinical aesthetic — clean, serious, trustworthy.
No decorative elements. Information density matters."
```

```
Claude prompt (for disclaimer):
"Design the exact disclaimer UI text for 3 safety tiers in ClarityRay:

Tier 1 (possible_finding): model flagged a pathology > 0.3 confidence
Tier 2 (no_finding): no pathology > 0.3 confidence
Tier 3 (low_confidence): all pathologies between 0.1 and 0.3

Each tier needs:
- A header line (max 8 words)
- Two sentences of safe, plain-language explanation
- A mandatory 'consult physician' statement
- A confidence caveat

Write for a non-medical audience but err heavily on caution.
These words will appear in a medical screening tool."
```

---

### Day 10 — GradCAM Overlay Component
**Tool: ChatGPT-4o**

```
ChatGPT-4o prompt:
"Write a React component that:
1. Takes an original image and a GradCAM heatmap (both as canvas elements)
2. Renders them side by side with a toggle button between:
   - Original image
   - Image with GradCAM overlay (hot colormap blended at 40% opacity)
   - GradCAM heatmap only
3. Adds a color scale legend (blue=low attention, red=high attention)
4. All rendering done on HTML canvas, no external libraries
5. Works with medical X-ray images (grayscale base image)"
```

---

### Day 11 — Main Page Assembly
**Tool: Cursor AI**

```
Cursor AI prompt:
"Assemble the main ClarityRay analysis page using:
- UploadZone component (from /components/UploadZone.tsx)
- ResultsPanel component (from /components/ResultsPanel.tsx)
- GradCAMViewer component (from /components/GradCAMViewer.tsx)
- useClarityRay hook (from /hooks/useClarityRay.ts)

Layout:
- Before upload: centered upload zone + tagline
- During analysis: progress bar with 'Analyzing locally...' message
- After analysis: two-column layout (image+gradcam left, results right)

States to handle:
- idle (show upload zone)
- loading_model (first time: 'Loading AI model...')
- preprocessing (show 'Preparing image...')
- running (show 'Running analysis locally...')
- complete (show results)
- error (show plain-language error message)

Important: show a 'Zero data leaves your device' indicator
that is visible in ALL states, not just on the landing page."
```

---

### Day 12 — DICOM Integration
**Tool: ChatGPT-4o + Copilot**

```
ChatGPT-4o prompt:
"I have a working chest X-ray classifier that processes PNG/JPEG.
I need to add DICOM support using [chosen library].

Write a React hook useDICOM() that:
1. Accepts a .dcm file
2. Extracts pixel data using the library
3. Applies appropriate windowing (default chest window: WC=-600, WW=1500)
4. Exports a normalized canvas element suitable for DenseNet121 input
5. Returns patient metadata: study date, modality, body part (if present)
   — all displayed locally, never sent anywhere

Also write the UI to show a window/level slider so users can adjust
the rendering before running analysis."
```

---

### Day 13 — Performance & Model Loading
**Tool: Claude (architecture decision) + Copilot (implementation)**

```
Claude prompt:
"My ONNX model file (DenseNet121) is ~30MB.
In my Next.js + ONNX Runtime Web app, I have this problem:
- First load takes 5-10 seconds (model download + WASM init)
- Users think it's broken

Give me the complete strategy to handle this:
1. How to cache the model in IndexedDB after first download
2. How to show a meaningful loading progress indicator
3. Whether to use WebGL or WASM backend (tradeoffs for medical images)
4. How to handle the model loading in a Web Worker to avoid UI freeze
5. What to show users while the model loads on first visit

Give me the implementation for items 1, 2, and 4."
```

---

### Day 14 — Error Handling + Edge Cases
**Tool: Claude**

```
Claude prompt:
"My medical AI app processes chest X-rays in the browser.
List every realistic error a user might encounter and for each:
1. The technical cause
2. The user-facing plain-English message (never technical)
3. The recovery action to offer them

Include:
- File too large (>10MB)
- Wrong file type uploaded
- DICOM from non-chest body part
- DICOM with corrupted pixel data
- Model inference returns NaN or out-of-range values
- Browser doesn't support WebAssembly
- Low memory device
- User uploads a photo of a printed X-ray (not a digital DICOM/file)
- Very low quality/resolution image

For each, write the exact UI copy (header + body + button text)."
```

---

### WEEK 3: Polish, Safety, Launch
### (Days 15–21)

---

### Day 15 — Safety & Disclaimer System
**Tool: Claude**

This is not optional and cannot be rushed.
Medical AI requires extraordinary care in how results are presented.

```
Claude prompt:
"Design the complete safety communication system for ClarityRay,
a browser-based chest X-ray screening tool (NOT a diagnostic tool).

I need:
1. Pre-analysis consent screen (one-time, stored in localStorage)
   — what must it say to be legally and ethically responsible?

2. Per-result disclaimer system based on finding severity
   — write the exact text for each tier

3. 'About this model' info panel content:
   — training dataset (NIH ChestX-ray14)
   — known limitations and biases
   — accuracy metrics from the original CheXNet paper
   — recommended use cases
   — explicitly NOT recommended use cases

4. Safe result language guidelines:
   — phrases that MUST appear
   — phrases that MUST NEVER appear
   — how to describe each of the 14 pathology classes in plain language

This content will appear in a medical tool. Treat it as you would
copy for a real medical device. Be conservative."
```

---

### Day 16 — Landing Page (Already Exists — Refine)
**Tool: v0 + ChatGPT-4o**

The landing page at clarityray.vercel.app is already good.
The task is connecting it to the working analysis page.

```
ChatGPT-4o prompt:
"I have a working Next.js landing page for ClarityRay.
The analysis tool is now at /analyze route.

Write the routing and transition code to:
1. Landing page CTA button 'Try it now' → goes to /analyze
2. /analyze page has a subtle back link to home
3. Add a 'Try with sample image' button on /analyze
   that loads a public-domain chest X-ray sample
   so users can test without having their own X-ray

The sample image should be hosted as a public asset.
Find a public domain chest X-ray I can use legally
(NIH provides them — give me the exact source)."
```

---

### Day 17 — Report Export
**Tool: ChatGPT-4o**

```
ChatGPT-4o prompt:
"Write a JavaScript function for a medical screening report generator.
It should create a downloadable PDF report using only browser-native
APIs (no jsPDF, no server) — use canvas + print CSS + window.print()
or blob URLs.

The report must include:
- ClarityRay header with disclaimer that this is NOT a diagnosis
- Date and time of analysis (local device time only)
- Uploaded filename (not the image itself — privacy)
- Findings table: pathology, confidence, threshold, flag
- GradCAM image embedded
- Full disclaimer text
- 'Reviewed by: _______' blank line for physician signature

Keep it clean and clinical — suitable for attaching to a patient file."
```

---

### Day 18 — Browser Compatibility + Testing
**Tool: Cursor AI + manual testing**

```
Cursor AI prompt:
"Audit my ClarityRay Next.js application for browser compatibility.

Check and fix:
1. ONNX Runtime Web requires SharedArrayBuffer — is my app sending
   the correct COOP/COEP headers from next.config.js?
2. File API usage — does it work in Safari 16+?
3. Canvas operations — any issues in Firefox?
4. DICOM parsing — test with at least 2 different DICOM variants
5. Memory usage — does running inference cause tab crashes on 4GB RAM devices?

Write the next.config.js additions needed for COOP/COEP headers
and a basic test script I can run to verify the ONNX runtime
initializes correctly in all three major browsers."
```

---

### Day 19 — Performance Optimization
**Tool: Claude + Copilot**

```
Claude prompt:
"My chest X-ray analysis app has these performance characteristics:
- Model file: ~30MB ONNX
- First load time: 8-12 seconds (model download + WASM compile)
- Inference time: 3-8 seconds on CPU (acceptable)
- Memory peak: ~400MB during inference

The 8-12 second first load is my biggest UX problem.

Give me a concrete plan to reduce perceived first-load time:
1. Should I quantize the model to INT8? What accuracy loss on ChestX-ray14?
2. Should I use ONNX Runtime WebGL backend vs WASM?
3. What exactly should the loading screen show and when?
4. Is there a way to split the model and load the first layers
   while the user is uploading their image?

Be specific about expected improvements for each suggestion."
```

---

### Day 20 — Early Access Waitlist Integration
**Tool: ChatGPT-4o**

The landing page already has a waitlist form.
Connect it to something simple.

```
ChatGPT-4o prompt:
"The ClarityRay landing page has an early access form with:
- Dropdown: Doctor / Developer / Researcher / Just curious
- Textarea: 'What would you expect from this product?'

Write the simplest possible solution to store these submissions:
Option A: Formspree (zero backend — just a form action URL)
Option B: Vercel Edge Function + Google Sheets API
Option C: Resend email notification to myself

Which is fastest to implement? Give me the complete implementation
for the fastest option. I want this working in under 1 hour."
```

---

### Day 21 — Launch
**Tool: All of them for final checks**

```
Launch checklist:

FUNCTIONAL
  □ Upload JPEG → analysis works → result shown
  □ Upload PNG → analysis works → result shown
  □ Upload DICOM → analysis works → result shown
  □ 'Try sample image' button works
  □ GradCAM overlay toggles correctly
  □ Download report works
  □ All error states show human-readable messages

SAFETY
  □ Consent screen appears on first visit
  □ Disclaimer visible on every result
  □ No result uses diagnosis language
  □ 'About this model' panel has accurate accuracy stats
  □ Model limitations are prominently stated

PERFORMANCE
  □ Model loads in < 10 seconds on 50Mbps connection
  □ Inference completes in < 15 seconds on laptop CPU
  □ No tab crash on 8GB RAM machine
  □ Works on Chrome, Firefox, Safari

PRIVACY
  □ Network tab shows NO requests during analysis
  □ No analytics that track uploaded images
  □ localStorage only stores consent flag, nothing else

LAUNCH ACTIONS
  □ Tweet with demo GIF: "Upload your chest X-ray. AI runs in your browser.
     Zero data leaves your device. Try it: clarityray.vercel.app"
  □ Post on r/MachineLearning, r/medicalimaging
  □ Submit to Hacker News: "Show HN: Medical AI that runs entirely in your browser"
  □ Share in medical AI Discord servers
  □ Email 10 doctors/researchers you know personally
```

---

# PART 4 — THE COMPLETE MULTI-AI TOOL MAP

## When To Use Each Tool (Quick Reference)

```
STAGE                    USE THIS TOOL        REASON
─────────────────────────────────────────────────────────────────────────

RESEARCH & DECISIONS
  Find best ONNX model   Perplexity           Has current sources + citations
  Architecture choice    Claude               Deep reasoning, no hallucination
                                              on technical tradeoffs
  Safety/medical copy    Claude               Conservative, thorough reasoning

CODE GENERATION
  First working version  ChatGPT-4o           Fast, good at web APIs
  UI components          v0 by Vercel         Purpose-built for React/Tailwind
  Complex algorithms     Claude               GradCAM, preprocessing math
  While typing (inline)  GitHub Copilot       In-editor, context-aware

REFACTORING & INTEGRATION
  Wire things together   Cursor AI            Whole-codebase context
  Fix bugs across files  Cursor AI            Sees all files at once
  Rename / reorganize    Cursor AI            Understands project structure

TESTING & REVIEW
  Code review            Claude               Finds logic errors, security issues
  Test case generation   ChatGPT-4o           Quick, comprehensive lists
  Browser compatibility  Claude               Knows WebAssembly quirks

DESIGN & ASSETS
  React component UI     v0 by Vercel         Best React component generator
  Mockup screenshots     DALL-E / Midjourney  Visual assets for landing page
  Icon design            DALL-E              App icon variants

WRITING & COPY
  Technical docs         Claude               Precise, structured
  Marketing copy         ChatGPT-4o           Punchy, creative
  Safety disclaimers     Claude               Conservative, thorough
  Error messages         Claude               Empathetic, clear
```

---

## The Actual Prompting Strategy

### Rule 1: Give Context Before Asking

Bad prompt:
```
"Write a GradCAM implementation in JavaScript"
```

Good prompt:
```
"I have a DenseNet121 model converted to ONNX running via onnxruntime-web.
The model takes input [1, 3, 224, 224] (ImageNet normalized).
I cannot access gradients in ONNX Runtime Web.
I need a GradCAM-like attention visualization.
My constraint: must run in <5 seconds on CPU.
Write a Score-CAM implementation in TypeScript."
```

### Rule 2: Ask One Tool To Review Another's Output

Pattern that works:
```
Step 1: ChatGPT-4o generates the inference code (fast)
Step 2: Claude reviews it for bugs and medical safety issues (thorough)
Step 3: Copilot implements the fixes while you type (in-editor)
```

### Rule 3: Use Claude For Decisions, ChatGPT For Speed

When you need to decide between two approaches → Claude
When you need working code fast → ChatGPT-4o
When you need to understand a codebase → Cursor

### Rule 4: Never Ask AI To Do Medical Safety Work Alone

All safety-critical content (disclaimers, result language, consent screens)
must be reviewed by a domain expert (a doctor, if possible).
AI tools can draft; a human must approve.

---

# PART 5 — THE V1 SCOPE (FINAL, NON-NEGOTIABLE)

## What Ships In V1 (21 Days)

```
✓ SHIPS
────────────────────────────────────────────────
✓ DenseNet121 running in browser via ONNX
✓ JPEG + PNG + DICOM file support
✓ 14-class chest pathology output
✓ Confidence scores per finding
✓ GradCAM attention overlay
✓ Plain-language result translation
✓ Tiered safety disclaimers
✓ Consent screen (first visit)
✓ 'About this model' info panel
✓ Sample image to try without own X-ray
✓ Download result as PDF report
✓ Zero network requests during analysis
✓ Works on Chrome, Firefox, Safari
✓ Connected to existing landing page
```

## What Does NOT Ship In V1

```
✗ DOES NOT SHIP
────────────────────────────────────────────────
✗ Desktop app (Tauri)
✗ Any model other than DenseNet121
✗ User accounts
✗ Saved history
✗ Multiple body parts (chest only)
✗ CT scan support (X-ray only)
✗ PACS integration
✗ API
✗ Batch processing
✗ Mobile app
✗ Any backend server
✗ Database
✗ Authentication
✗ Sharing / collaboration
```

## V2 Roadmap (After 100 Real Users Give Feedback)

```
V2 — Desktop App
  Tauri wrapper around the same web app
  IndexedDB model cache (no re-download)
  Offline after first use
  Proper DICOM viewer with W/L controls

V2 — Second Model
  Add one model based on user feedback
  Most likely: pneumonia classifier or bone age
  NOT multiple models — ONE addition

V3 — Developer API
  ONLY if developers are asking for it
  Package format for third-party medical models
  Strict safety certification required
```

---

# PART 6 — THE THREE THINGS THAT WILL DECIDE IF THIS WINS

## 1. The Model Must Be Accurate Enough To Be Useful

DenseNet121 on NIH ChestX-ray14 has AUC ~0.84 on chest pathologies.
That is not diagnostic-grade. It is screening-grade.
Your marketing must reflect this precisely.

The positioning: "A second pair of eyes. Not a replacement for the first."
This is honest, useful, and defensible.

## 2. The Safety Framing Must Be Right

One wrong result that someone acts on becomes a lawsuit and a shutdown.
Every screen must make it impossible to forget this is a screening tool.

Not just a disclaimer at the bottom.
Disclaimer woven into every result, every finding, every number shown.

## 3. The First 30 Seconds Must Work For A Doctor

Find one doctor willing to try it.
Sit next to them and watch.
They will tell you what's broken in 5 minutes.

Everything else — performance, architecture, model accuracy —
matters less than "does a doctor find this useful enough to use twice?"

---

## The One Metric That Matters In Month 1

```
How many users try it MORE THAN ONCE?
```

Not total users. Not downloads. Not signups.
Return usage. That's the signal that the core experience works.
Target: 30% of users who complete one analysis come back for a second.

---

*ClarityRay Minimal Build Plan v3.0*
*Scope reduction: ~70% from previous version*
*Build time: 21 days (solo) using multi-AI workflow*
*Stack: Next.js + ONNX Runtime Web + Vercel (zero backend)*
*Total backend lines of code: 0*

---

# 🔍 CURRENT IMPLEMENTATION STATUS (CRITICAL CONTEXT)

## 🧠 PROJECT STATE

ClarityRay MVP is partially implemented.

Core pipeline exists:

Upload → preprocess → ONNX inference → postprocess → UI

However, system is NOT production-ready yet.

---

## ⚠️ CURRENT MODEL DETAILS (IMPORTANT)

Model file:
`/public/chestxray_densenet121.onnx`

Actual model output:

* shape: [1, 2]
* classes:

  * "Normal"
  * "Lung Cancer"

⚠️ NOTE:
This is NOT the 14-class NIH model.
It is a binary classification model.

---

## 🚨 KNOWN ISSUES (MUST FIX)

### 1. LABEL MISMATCH

Code currently assumes 14 labels.

❌ WRONG:
14 chest pathologies

✅ CORRECT:
["Normal", "Lung Cancer"]

---

### 2. OUTPUT IS LOGITS (NOT PROBABILITIES)

Model returns raw logits like:
[1.05, -0.53]

MUST apply softmax before using:

```ts
function softmax(arr: number[]) {
  const exp = arr.map(Math.exp);
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(v => v / sum);
}
```

---

### 3. GRADCAM IS MOCK

* No gradient access in ONNX Runtime Web
* Current heatmap is visual approximation

This is acceptable for MVP BUT:

UI MUST clearly say:
"Visualization aid only — not a diagnostic feature"

---

### 4. SAFETY LANGUAGE INCOMPLETE

Current system lacks strict medical-safe phrasing.

Must enforce:

✔ Use:

* "possible finding"
* "may indicate"
* "suggests"

❌ Never use:

* direct diagnosis claim wording
* definitive diagnosis terms
* absolute confirmation terms

Always include:
"This is a screening tool, not a diagnosis"

---

### 5. MISSING LOADING STATES

User currently gets no feedback during:

* model loading
* inference

Must add:

* "Loading AI model locally..."
* "Running analysis..."

---

### 6. NO CONSENT SCREEN

Must add first-visit consent:

* show popup
* store in localStorage
* block usage until accepted

---

## ✅ WHAT IS WORKING

* ONNX model loads in browser
* Preprocessing pipeline implemented
* Inference pipeline implemented
* Basic UI components exist
* Zero backend architecture is correct

---

## 🎯 CURRENT GOAL

Stabilize MVP — NOT expand features.

Focus ONLY on:

1. Fix ML correctness (labels + softmax)
2. Improve safety messaging
3. Fix UX gaps (loading, errors)
4. Ensure full working flow:
   Upload → Analyze → Result

---

## 🚫 DO NOT DO

* Do NOT add backend
* Do NOT add new models
* Do NOT add authentication
* Do NOT expand scope

---

## 🧪 DEFINITION OF DONE

System is complete when:

✔ User uploads image
✔ Clicks analyze
✔ Model runs in browser
✔ Result is shown safely
✔ No crashes
✔ No incorrect outputs
✔ Clear disclaimer present

---

## 🔥 ENGINEERING PRIORITY

Correctness > Safety > UX > Performance

---

# 🚀 FINAL NOTE

This is a **focused MVP**, not a platform.

Do NOT over-engineer.

Ship the simplest working version.

---
