# ClarityRay — Postprocessing Logic Issues

Audit of `lib/clarity/postprocess.ts` and `lib/clarity/run.ts` against production correctness.

---

## Critical Bugs

### 1. Multiclass — Suspicious label shown alongside `no_finding` tier

**File:** `lib/clarity/postprocess.ts:388–442`

When a suspicious class wins argmax but its probability falls **below** `low_confidence` (default 0.25), the result is:

```typescript
primaryFinding: topLabel,     // e.g. "Melanoma"
safetyTier:    "no_finding",  // green safe indicator
findings:      [],
```

A user sees **"Melanoma — No Finding"** — a malignancy label paired with a safe-looking indicator. In a medical screener this is the worst possible inconsistency: it either falsely reassures or falsely alarms depending on which element the user reads first.

**Root cause:** the `primaryFinding` is set to `topLabel` unconditionally before the tier check. When `tier === "no_finding"` the return still carries the suspicious class name.

**Fix:**

```typescript
primaryFinding: tier === "no_finding" && suspicious
  ? "Below reporting threshold"
  : topLabel,
```

---

### 2. Binary — Class order is an unguarded silent assumption

**File:** `lib/clarity/postprocess.ts:178`

```typescript
const findingProb = probabilities[1];   // assumed: index 1 = finding
const normalProb  = probabilities[0];   // assumed: index 0 = normal
```

There is no validation that `classes[1]` is actually the suspicious/finding class. A binary `clarity.json` with classes listed as `["Pneumonia", "Normal"]` instead of `["Normal", "Pneumonia"]` silently **inverts every result** — healthy scans flagged, diseased scans cleared — with no error thrown at any layer.

**Fix:** guard at the top of `translateResults`:

```typescript
const findingLabel = classes[1] ?? "";
const looksInverted =
  /\b(normal|no.?finding|negative|healthy)\b/i.test(findingLabel);
if (looksInverted) {
  throw new Error(
    `Binary class order looks inverted: classes[1] is "${findingLabel}". ` +
    `classes[0] must be the negative/normal class, classes[1] the finding class.`
  );
}
```

---

### 3. SHA256 integrity is parsed but never verified

**File:** `lib/clarity/run.ts` (gap — code is entirely missing)

`spec.integrity.sha256` is strictly validated as a 64-character hex string in `lib/clarity/types.ts:359`, but is **never compared against the downloaded model bytes** anywhere in `loadModelInWorker` or `runInferenceMainThread`. A corrupted download, CDN swap, or MITM substitution passes silently.

**Fix:** hash the `ArrayBuffer` after download, before the worker receives it:

```typescript
async function verifyIntegrity(
  buffer: ArrayBuffer,
  spec: ClaritySpec,
): Promise<void> {
  if (!spec.integrity?.sha256) return;
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hex !== spec.integrity.sha256) {
    throw new Error(
      `Integrity check failed for "${spec.id}". ` +
      `Expected ${spec.integrity.sha256}, got ${hex}.`
    );
  }
}

// Inside loadModelInWorker, before postMessage:
await verifyIntegrity(modelBuffer, spec);
```

---

### 4. Segmentation — "No region segmented" when benign regions exist

**File:** `lib/clarity/postprocess.ts:626`

When the model segments tissue but all detected regions are non-suspicious (`suspicious: false`), the result is:

```typescript
primaryFinding: "No region segmented",
safetyTier:    "no_finding",
```

This is **factually wrong** — regions were segmented, they are just benign. The distinction matters clinically: "we found tissue and it's benign" is a different statement from "we found nothing." A user seeing "No region segmented" on a scan that shows clear benign coverage has received inaccurate information.

**Fix:**

```typescript
primaryFinding: present.length > 0
  ? `${present[0].label} (no suspicious region)`
  : "No region segmented",
```

---

## Production Gaps

### 5. No inference timeout

**File:** `lib/clarity/run.ts`

`runInference` returns a `Promise<Float32Array>` that **never rejects or resolves** if the inference worker hangs (out-of-memory, corrupt ONNX, infinite loop in graph). The UI stalls indefinitely with no recovery path. For a 327 MB model like the skin lesion ViT, this is a realistic failure mode on low-memory devices.

**Fix:** wrap the worker promise with a `AbortSignal`-aware timeout:

```typescript
const INFERENCE_TIMEOUT_MS = 60_000;

// Inside runInference, around the worker promise:
const timeoutId = setTimeout(() => {
  pending.delete(id);
  reject(new Error(`Inference timed out after ${INFERENCE_TIMEOUT_MS / 1000}s.`));
}, INFERENCE_TIMEOUT_MS);

pending.set(id, {
  resolve: (v) => { clearTimeout(timeoutId); resolve(v as Float32Array); },
  reject:  (e) => { clearTimeout(timeoutId); reject(e); },
});
```

---

### 6. Worker crash marks session as permanently degraded

**File:** `lib/clarity/run.ts:49`

`_workerDead` is set to `true` on crash and **never reset**. The main-thread fallback fires for every subsequent inference, blocking the UI thread. No attempt is made to restart the worker.

```typescript
_worker.onerror = (ev) => {
  _workerDead = true   // permanent — never cleared
  _worker = null
  ...
}
```

**Fix:** implement an exponential-backoff restart with a cap (e.g. 3 attempts), resetting `_workerDead` before each retry.

---

### 7. `loadedModels.add` fires even when the worker never received bytes

**File:** `lib/clarity/run.ts:119`

```typescript
// if worker is null (dead), postMessage never runs, but:
loadedModels.add(specId)   // ← marked loaded regardless
```

`hasSession(specId)` returns `true` even though no bytes were delivered to any session. The fallback `runInferenceMainThread` creates its own session on demand, but this happens silently during the first inference call rather than during "loading," adding unexpected latency and hiding the worker failure from callers.

**Fix:** only call `loadedModels.add` inside the branch that actually succeeded, and expose a loading-state enum (`"loaded-worker" | "loaded-main-thread" | "failed"`) instead of a bare boolean.

---

### 8. Binary result omits `task` and `findings` fields

**File:** `lib/clarity/postprocess.ts:220–232`

`translateResults` (the binary path) does not set `task` or `findings` on its return value. Every other task (`multilabel`, `multiclass`, `segmentation`, `detection`) populates both. UI code reading `result.findings` or `result.task` gets `undefined` for binary models, which can silently break rendering or type-narrow incorrectly.

**Fix:** add to the binary return objects:

```typescript
task: "binary",
findings: findingProb >= posThreshold
  ? [{ label: classes[1], probability: findingProb, suspicious: true }]
  : [],
```

---

## Summary

| # | Issue | Severity | File | Line |
|---|-------|----------|------|------|
| 1 | Suspicious label shown with `no_finding` tier | **Critical** | postprocess.ts | 429 |
| 2 | Binary class order unchecked — silent inversion possible | **Critical** | postprocess.ts | 178 |
| 3 | SHA256 integrity never verified at runtime | **Critical** | run.ts | missing |
| 4 | Segmentation "no region" text wrong when benign regions exist | **High** | postprocess.ts | 626 |
| 5 | No inference timeout — UI hangs on large/corrupt models | **High** | run.ts | 151 |
| 6 | Worker crash → permanently degraded, no restart | **Medium** | run.ts | 49 |
| 7 | `loadedModels.add` fires when worker never loaded the model | **Medium** | run.ts | 119 |
| 8 | Binary result missing `task` and `findings` fields | **Low** | postprocess.ts | 220 |

Fix **#1, #2, and #3** before any real user traffic. They are silent failures — no error is thrown, the UI looks normal, and the result is medically wrong.
