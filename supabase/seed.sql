-- ClarityRay — full schema + seed data
-- Run this once in your Supabase Dashboard → SQL Editor.
-- It is idempotent: safe to re-run at any time.
--
-- What this does:
--   1. Ensures the base schema (migrations 001–004) exists
--   2. Applies migration 005 (task / validation_status / safety_tier columns)
--   3. Applies migration 006 (spec_json jsonb column on model_versions)
--   4. Ensures the anon role can SELECT published models
--   5. Seeds all 7 bundled models with their versions AND full clarity.json spec

-- ─── 1. Base schema (001 / 004) ─────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS models (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        UNIQUE NOT NULL,
  name          text        NOT NULL,
  description   text,
  modality      text,
  bodypart      text,
  status        text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'published')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    uuid        NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version     text        NOT NULL,
  clarity_url text        NOT NULL,
  model_url   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_versions_model_id_version_key UNIQUE (model_id, version)
);

CREATE INDEX IF NOT EXISTS idx_models_slug             ON models(slug);
CREATE INDEX IF NOT EXISTS idx_models_status           ON models(status);
CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);

-- ─── 2. Migration 005 — task / validation / safety columns ──────────────────

ALTER TABLE models ADD COLUMN IF NOT EXISTS task              text NOT NULL DEFAULT 'binary';
ALTER TABLE models ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unvalidated';
ALTER TABLE models ADD COLUMN IF NOT EXISTS safety_tier       text NOT NULL DEFAULT 'screening';

CREATE INDEX IF NOT EXISTS idx_models_task              ON models(task);
CREATE INDEX IF NOT EXISTS idx_models_validation_status ON models(validation_status);

-- ─── 3. Migration 006 — spec_json jsonb column ──────────────────────────────
-- Stores the complete clarity.json as JSONB so /api/models/[slug]/spec can
-- serve it directly from Supabase without any local file dependency.

ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS spec_json jsonb;

CREATE INDEX IF NOT EXISTS idx_model_versions_spec_json
  ON model_versions USING gin(spec_json)
  WHERE spec_json IS NOT NULL;

-- ─── 4. Row Level Security — allow anon to read published models ─────────────

ALTER TABLE models         ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read published models"   ON models;
DROP POLICY IF EXISTS "anon can read published versions" ON model_versions;

CREATE POLICY "anon can read published models"
  ON models FOR SELECT
  USING (status = 'published');

CREATE POLICY "anon can read published versions"
  ON model_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM models m
      WHERE m.id = model_versions.model_id
        AND m.status = 'published'
    )
  );

-- ─── 5. Seed models ──────────────────────────────────────────────────────────

INSERT INTO models (slug, name, description, modality, bodypart, status, task, validation_status, safety_tier)
VALUES
  (
    'densenet121-chest',
    'DenseNet121 Chest X-ray Binary Classifier',
    'Binary classifier for chest X-rays — detects presence of lung findings vs. normal.',
    'xray', 'chest', 'published', 'binary', 'unvalidated', 'screening'
  ),
  (
    'densenet121-cxr-suspicious',
    'DenseNet121 CXR Multi-Label Pathology Demo',
    'Multi-label classifier covering 18 chest X-ray pathologies from TorchXRayVision.',
    'xray', 'chest', 'published', 'multilabel', 'unvalidated', 'screening'
  ),
  (
    'densenet121-cxr-suspicious-binary',
    'DenseNet121 CXR Multi-Label Pathology Demo (Binary Suspicious View)',
    'Binary suspicious-finding view over the TorchXRayVision multi-label model.',
    'xray', 'chest', 'published', 'binary', 'unvalidated', 'screening'
  ),
  (
    'densenet121-nih',
    'DenseNet121 NIH ChestX-ray14 (14 Pathologies)',
    'Multi-label classifier for 14 chest pathologies trained on the NIH ChestX-ray14 dataset.',
    'xray', 'chest', 'published', 'multilabel', 'unvalidated', 'screening'
  ),
  (
    'brain-ctscan-cancer',
    'Brain CT Tumor Classifier',
    'Multiclass brain CT classifier — detects glioma, meningioma, pituitary findings, or no finding.',
    'ct', 'brain', 'published', 'multiclass', 'unvalidated', 'screening'
  ),
  (
    'resnet50-cxr-suspicious',
    'ResNet50 CXR Multi-Label Pathology Demo',
    'ResNet50 multi-label classifier covering 18 chest X-ray pathologies (TorchXRayVision, 512×512 input).',
    'xray', 'chest', 'published', 'multilabel', 'unvalidated', 'research'
  ),
  (
    'efficientnetb4-skin-ham10000',
    'Skin Lesion Classifier — HAM10000 (EfficientNet)',
    '7-class dermoscopy classifier covering melanoma, basal cell carcinoma, actinic keratosis, melanocytic nevi, benign keratosis, vascular lesion, and dermatofibroma. Trained on HAM10000 (ISIC 2018 Task 3, ~83% balanced accuracy).',
    'dermoscopy', 'skin', 'published', 'multiclass', 'unvalidated', 'screening'
  )
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  modality          = EXCLUDED.modality,
  bodypart          = EXCLUDED.bodypart,
  status            = EXCLUDED.status,
  task              = EXCLUDED.task,
  validation_status = EXCLUDED.validation_status,
  safety_tier       = EXCLUDED.safety_tier;

-- ─── 6. Seed model_versions with full clarity.json (spec_json) ───────────────
-- clarity_url now points to /api/models/{slug}/spec — the Supabase-backed
-- Next.js route that returns spec_json directly. This makes the spec available
-- in any deployed environment without local file dependencies.

-- ── densenet121-chest ─────────────────────────────────────────────────────────
INSERT INTO model_versions (model_id, version, clarity_url, model_url, spec_json)
SELECT
  id, '1.0.0',
  '/api/models/densenet121-chest/spec',
  'https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-chest/model.onnx',
  '{
    "id": "densenet121-chest",
    "name": "DenseNet121 Chest X-ray Binary Classifier",
    "version": "1.0.0",
    "certified": false,
    "bodypart": "chest",
    "modality": "xray",
    "model": {
      "file": "https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-chest/model.onnx",
      "format": "onnx"
    },
    "input": {
      "shape": [1, 1, 224, 224],
      "layout": "NCHW",
      "normalize": { "mean": [0], "std": [0.00392156863] }
    },
    "output": {
      "task": "binary",
      "shape": [1, 2],
      "classes": ["No suspicious chest finding", "Possible suspicious chest finding"],
      "activation": "softmax"
    },
    "safety": {
      "tier": "screening",
      "disclaimer": "This tool is for screening support only. It does not diagnose cancer or any disease. A possible finding requires clinician review. A no finding result does not rule out disease."
    },
    "thresholds": {
      "possible_finding": 0.5,
      "low_confidence": 0.25,
      "validation_status": "unvalidated"
    },
    "source_model": {
      "family": "DenseNet121",
      "source": "TorchXRayVision densenet121-res224-all (binary suspicious-finding view)",
      "selected_findings": ["Mass", "Nodule", "Lung Opacity", "Lung Lesion"]
    },
    "explainability": {
      "enabled": true,
      "method": "occlusion_sensitivity",
      "isModelBased": true,
      "isGradCAM": false,
      "disclaimer": "This overlay highlights image regions that most influenced the model prediction. It is not a clinically validated saliency map."
    }
  }'::jsonb
FROM models WHERE slug = 'densenet121-chest'
ON CONFLICT (model_id, version) DO UPDATE SET
  clarity_url = EXCLUDED.clarity_url,
  model_url   = EXCLUDED.model_url,
  spec_json   = EXCLUDED.spec_json;

-- ── densenet121-cxr-suspicious ────────────────────────────────────────────────
INSERT INTO model_versions (model_id, version, clarity_url, model_url, spec_json)
SELECT
  id, '1.0.0',
  '/api/models/densenet121-cxr-suspicious/spec',
  'https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-cxr-suspicious/model.onnx',
  '{
    "id": "densenet121-cxr-suspicious",
    "name": "DenseNet121 CXR Multi-Label Pathology Demo",
    "version": "1.0.0",
    "certified": false,
    "bodypart": "chest",
    "modality": "xray",
    "model": {
      "file": "https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-cxr-suspicious/model.onnx",
      "format": "onnx"
    },
    "input": {
      "shape": [1, 1, 224, 224],
      "layout": "NCHW",
      "normalize": { "mean": [0], "std": [0.00392156863] }
    },
    "output": {
      "task": "multilabel",
      "shape": [1, 18],
      "classes": [
        "Atelectasis", "Consolidation", "Infiltration", "Pneumothorax",
        "Edema", "Emphysema", "Fibrosis", "Effusion", "Pneumonia",
        "Pleural_Thickening", "Cardiomegaly", "Nodule", "Mass", "Hernia",
        "Lung Lesion", "Fracture", "Lung Opacity", "Enlarged Cardiomediastinum"
      ],
      "activation": "none",
      "labels": [
        { "name": "Atelectasis",                "threshold": 0.5, "suspicious": false },
        { "name": "Consolidation",              "threshold": 0.5, "suspicious": false },
        { "name": "Infiltration",               "threshold": 0.5, "suspicious": false },
        { "name": "Pneumothorax",               "threshold": 0.5, "suspicious": false },
        { "name": "Edema",                      "threshold": 0.5, "suspicious": false },
        { "name": "Emphysema",                  "threshold": 0.5, "suspicious": false },
        { "name": "Fibrosis",                   "threshold": 0.5, "suspicious": false },
        { "name": "Effusion",                   "threshold": 0.5, "suspicious": false },
        { "name": "Pneumonia",                  "threshold": 0.5, "suspicious": false },
        { "name": "Pleural_Thickening",         "threshold": 0.5, "suspicious": false },
        { "name": "Cardiomegaly",               "threshold": 0.5, "suspicious": false },
        { "name": "Nodule",                     "threshold": 0.5, "suspicious": true  },
        { "name": "Mass",                       "threshold": 0.5, "suspicious": true  },
        { "name": "Hernia",                     "threshold": 0.5, "suspicious": false },
        { "name": "Lung Lesion",                "threshold": 0.5, "suspicious": true  },
        { "name": "Fracture",                   "threshold": 0.5, "suspicious": false },
        { "name": "Lung Opacity",               "threshold": 0.5, "suspicious": true  },
        { "name": "Enlarged Cardiomediastinum", "threshold": 0.5, "suspicious": false }
      ]
    },
    "safety": {
      "tier": "screening",
      "disclaimer": "This tool is for screening support only. It does not diagnose cancer or any disease. A possible finding requires clinician review. A no finding result does not rule out disease."
    },
    "thresholds": {
      "validation_status": "unvalidated"
    },
    "source_model": {
      "family": "DenseNet121",
      "source": "TorchXRayVision densenet121-res224-all"
    },
    "explainability": {
      "enabled": true,
      "method": "occlusion_sensitivity",
      "isModelBased": true,
      "isGradCAM": false,
      "disclaimer": "This overlay highlights image regions that most influenced the model prediction. It is not a clinically validated saliency map."
    }
  }'::jsonb
FROM models WHERE slug = 'densenet121-cxr-suspicious'
ON CONFLICT (model_id, version) DO UPDATE SET
  clarity_url = EXCLUDED.clarity_url,
  model_url   = EXCLUDED.model_url,
  spec_json   = EXCLUDED.spec_json;

-- ── densenet121-cxr-suspicious-binary ────────────────────────────────────────
INSERT INTO model_versions (model_id, version, clarity_url, model_url, spec_json)
SELECT
  id, '1.0.0',
  '/api/models/densenet121-cxr-suspicious-binary/spec',
  'https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-cxr-suspicious-binary/model.onnx',
  '{
    "id": "densenet121-cxr-suspicious-binary",
    "name": "DenseNet121 CXR Multi-Label Pathology Demo (Binary Suspicious View)",
    "version": "1.0.0",
    "certified": false,
    "bodypart": "chest",
    "modality": "xray",
    "model": {
      "file": "https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-cxr-suspicious-binary/model.onnx",
      "format": "onnx"
    },
    "input": {
      "shape": [1, 1, 224, 224],
      "layout": "NCHW",
      "normalize": { "mean": [0], "std": [0.00392156863] }
    },
    "output": {
      "task": "binary",
      "shape": [1, 2],
      "classes": ["No suspicious chest finding", "Possible suspicious chest finding"],
      "activation": "softmax"
    },
    "safety": {
      "tier": "screening",
      "disclaimer": "This tool is for screening support only. It does not diagnose cancer or any disease. A possible finding requires clinician review. A no finding result does not rule out disease."
    },
    "thresholds": {
      "possible_finding": 0.5,
      "low_confidence": 0.25,
      "validation_status": "unvalidated"
    },
    "source_model": {
      "family": "DenseNet121",
      "source": "TorchXRayVision densenet121-res224-all (binary derived view)",
      "selected_findings": ["Mass", "Nodule", "Lung Opacity", "Lung Lesion"]
    },
    "explainability": {
      "enabled": true,
      "method": "occlusion_sensitivity",
      "isModelBased": true,
      "isGradCAM": false,
      "disclaimer": "This overlay highlights image regions that most influenced the model prediction. It is not a clinically validated saliency map."
    }
  }'::jsonb
FROM models WHERE slug = 'densenet121-cxr-suspicious-binary'
ON CONFLICT (model_id, version) DO UPDATE SET
  clarity_url = EXCLUDED.clarity_url,
  model_url   = EXCLUDED.model_url,
  spec_json   = EXCLUDED.spec_json;

-- ── densenet121-nih ───────────────────────────────────────────────────────────
INSERT INTO model_versions (model_id, version, clarity_url, model_url, spec_json)
SELECT
  id, '1.0.0',
  '/api/models/densenet121-nih/spec',
  'https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-nih/model.onnx',
  '{
    "id": "densenet121-nih",
    "name": "DenseNet121 NIH ChestX-ray14 14 Pathologies",
    "version": "1.0.0",
    "certified": false,
    "bodypart": "chest",
    "modality": "xray",
    "model": {
      "file": "https://huggingface.co/Shub-19/Chest/resolve/main/densenet121-nih/model.onnx",
      "format": "onnx"
    },
    "integrity": {
      "sha256": "57495ba35e270da7b66bafdb57cbebaff3003493a088df1a0424aca8a93d707a"
    },
    "input": {
      "shape": [1, 1, 224, 224],
      "layout": "NCHW",
      "normalize": { "mean": [0.5], "std": [0.5] }
    },
    "output": {
      "task": "multilabel",
      "shape": [1, 14],
      "classes": [
        "Atelectasis", "Cardiomegaly", "Effusion", "Infiltration",
        "Mass", "Nodule", "Pneumonia", "Pneumothorax", "Consolidation",
        "Edema", "Emphysema", "Fibrosis", "Pleural_Thickening", "Hernia"
      ],
      "activation": "none",
      "labels": [
        { "name": "Atelectasis",        "threshold": 0.5, "suspicious": true },
        { "name": "Cardiomegaly",       "threshold": 0.5, "suspicious": true },
        { "name": "Effusion",           "threshold": 0.5, "suspicious": true },
        { "name": "Infiltration",       "threshold": 0.5, "suspicious": true },
        { "name": "Mass",               "threshold": 0.5, "suspicious": true },
        { "name": "Nodule",             "threshold": 0.5, "suspicious": true },
        { "name": "Pneumonia",          "threshold": 0.5, "suspicious": true },
        { "name": "Pneumothorax",       "threshold": 0.5, "suspicious": true },
        { "name": "Consolidation",      "threshold": 0.5, "suspicious": true },
        { "name": "Edema",              "threshold": 0.5, "suspicious": true },
        { "name": "Emphysema",          "threshold": 0.5, "suspicious": true },
        { "name": "Fibrosis",           "threshold": 0.5, "suspicious": true },
        { "name": "Pleural_Thickening", "threshold": 0.5, "suspicious": true },
        { "name": "Hernia",             "threshold": 0.5, "suspicious": true }
      ]
    },
    "safety": {
      "tier": "screening",
      "disclaimer": "This is a screening tool. Results require review by a qualified physician."
    },
    "thresholds": {
      "possible_finding": 0.5,
      "low_confidence": 0.25,
      "validation_status": "unvalidated"
    },
    "explainability": {
      "enabled": true,
      "method": "occlusion_sensitivity",
      "isModelBased": true,
      "isGradCAM": false,
      "disclaimer": "This overlay highlights image regions that most influenced the model prediction. It is not a clinically validated saliency map."
    }
  }'::jsonb
FROM models WHERE slug = 'densenet121-nih'
ON CONFLICT (model_id, version) DO UPDATE SET
  clarity_url = EXCLUDED.clarity_url,
  model_url   = EXCLUDED.model_url,
  spec_json   = EXCLUDED.spec_json;

-- ── brain-ctscan-cancer ───────────────────────────────────────────────────────
INSERT INTO model_versions (model_id, version, clarity_url, model_url, spec_json)
SELECT
  id, '1.0.0',
  '/api/models/brain-ctscan-cancer/spec',
  'https://huggingface.co/Shub-19/Brain-CT/resolve/main/brain-ctscan-cancer/model.onnx',
  '{
    "id": "brain-ctscan-cancer",
    "name": "Brain CT Tumor Classifier",
    "version": "1.0.0",
    "certified": false,
    "bodypart": "brain",
    "modality": "ct",
    "model": {
      "file": "https://huggingface.co/Shub-19/Brain-CT/resolve/main/brain-ctscan-cancer/model.onnx",
      "format": "onnx"
    },
    "input": {
      "shape": [1, 3, 224, 224],
      "layout": "NCHW",
      "normalize": {
        "mean": [0.485, 0.456, 0.406],
        "std":  [0.229, 0.224, 0.225]
      }
    },
    "output": {
      "task": "multiclass",
      "shape": [1, 4],
      "classes": ["glioma", "meningioma", "notumor", "pituitary"],
      "activation": "softmax",
      "labels": [
        { "name": "glioma",     "threshold": 0.5, "suspicious": true  },
        { "name": "meningioma", "threshold": 0.5, "suspicious": true  },
        { "name": "notumor",    "threshold": 0.5, "suspicious": false },
        { "name": "pituitary",  "threshold": 0.5, "suspicious": true  }
      ]
    },
    "safety": {
      "tier": "screening",
      "disclaimer": "This tool is for screening support only. It does not diagnose cancer or any disease. A possible finding requires review by a qualified radiologist or neurosurgeon."
    },
    "thresholds": {
      "possible_finding": 0.5,
      "low_confidence": 0.25,
      "validation_status": "unvalidated"
    },
    "explainability": {
      "enabled": true,
      "method": "occlusion_sensitivity",
      "isModelBased": true,
      "isGradCAM": false,
      "disclaimer": "This overlay highlights image regions that most influenced the model prediction. It is not a clinically validated saliency map."
    }
  }'::jsonb
FROM models WHERE slug = 'brain-ctscan-cancer'
ON CONFLICT (model_id, version) DO UPDATE SET
  clarity_url = EXCLUDED.clarity_url,
  model_url   = EXCLUDED.model_url,
  spec_json   = EXCLUDED.spec_json;

-- ── resnet50-cxr-suspicious ───────────────────────────────────────────────────
INSERT INTO model_versions (model_id, version, clarity_url, model_url, spec_json)
SELECT
  id, '1.0.0',
  '/api/models/resnet50-cxr-suspicious/spec',
  'https://huggingface.co/Shub-19/Chest/resolve/main/resnet50-cxr-suspicious/model.onnx',
  '{
    "id": "resnet50-cxr-suspicious",
    "name": "ResNet50 CXR Multi-Label Pathology Demo",
    "version": "1.0.0",
    "certified": false,
    "bodypart": "chest",
    "modality": "xray",
    "model": {
      "file": "https://huggingface.co/Shub-19/Chest/resolve/main/resnet50-cxr-suspicious/model.onnx",
      "format": "onnx"
    },
    "input": {
      "shape": [1, 1, 512, 512],
      "layout": "NCHW",
      "normalize": { "mean": [0], "std": [0.00392156863] }
    },
    "output": {
      "task": "multilabel",
      "shape": [1, 18],
      "classes": [
        "Atelectasis", "Consolidation", "Infiltration", "Pneumothorax",
        "Edema", "Emphysema", "Fibrosis", "Effusion", "Pneumonia",
        "Pleural_Thickening", "Cardiomegaly", "Nodule", "Mass", "Hernia",
        "Lung Lesion", "Fracture", "Lung Opacity", "Enlarged Cardiomediastinum"
      ],
      "activation": "none",
      "labels": [
        { "name": "Atelectasis",                "threshold": 0.5, "suspicious": false },
        { "name": "Consolidation",              "threshold": 0.5, "suspicious": false },
        { "name": "Infiltration",               "threshold": 0.5, "suspicious": false },
        { "name": "Pneumothorax",               "threshold": 0.5, "suspicious": false },
        { "name": "Edema",                      "threshold": 0.5, "suspicious": false },
        { "name": "Emphysema",                  "threshold": 0.5, "suspicious": false },
        { "name": "Fibrosis",                   "threshold": 0.5, "suspicious": false },
        { "name": "Effusion",                   "threshold": 0.5, "suspicious": false },
        { "name": "Pneumonia",                  "threshold": 0.5, "suspicious": false },
        { "name": "Pleural_Thickening",         "threshold": 0.5, "suspicious": false },
        { "name": "Cardiomegaly",               "threshold": 0.5, "suspicious": false },
        { "name": "Nodule",                     "threshold": 0.5, "suspicious": true  },
        { "name": "Mass",                       "threshold": 0.5, "suspicious": true  },
        { "name": "Hernia",                     "threshold": 0.5, "suspicious": false },
        { "name": "Lung Lesion",                "threshold": 0.5, "suspicious": true  },
        { "name": "Fracture",                   "threshold": 0.5, "suspicious": false },
        { "name": "Lung Opacity",               "threshold": 0.5, "suspicious": true  },
        { "name": "Enlarged Cardiomediastinum", "threshold": 0.5, "suspicious": false }
      ]
    },
    "safety": {
      "tier": "research",
      "disclaimer": "This tool is for research use only. It does not diagnose cancer or any disease. Results require review by a qualified radiologist."
    },
    "thresholds": {
      "validation_status": "unvalidated"
    },
    "source_model": {
      "family": "ResNet50",
      "source": "TorchXRayVision resnet50-res512-all"
    },
    "explainability": {
      "enabled": true,
      "method": "occlusion_sensitivity",
      "isModelBased": true,
      "isGradCAM": false,
      "disclaimer": "This overlay highlights image regions that most influenced the model prediction. It is not a clinically validated saliency map."
    }
  }'::jsonb
FROM models WHERE slug = 'resnet50-cxr-suspicious'
ON CONFLICT (model_id, version) DO UPDATE SET
  clarity_url = EXCLUDED.clarity_url,
  model_url   = EXCLUDED.model_url,
  spec_json   = EXCLUDED.spec_json;

-- ── efficientnetb4-skin-ham10000 ──────────────────────────────────────────────
INSERT INTO model_versions (model_id, version, clarity_url, model_url, spec_json)
SELECT
  id, '1.0.0',
  '/api/models/efficientnetb4-skin-ham10000/spec',
  'https://huggingface.co/Shub-19/SKin-cancer/resolve/main/efficientnetb4-skin-ham10000/model.onnx',
  '{
    "id": "efficientnetb4-skin-ham10000",
    "name": "Skin Lesion Classifier — HAM10000 (EfficientNet)",
    "version": "1.0.0",
    "certified": false,
    "bodypart": "skin",
    "modality": "dermoscopy",
    "model": {
      "file": "https://huggingface.co/Shub-19/SKin-cancer/resolve/main/efficientnetb4-skin-ham10000/model.onnx",
      "format": "onnx"
    },
    "input": {
      "shape": [1, 3, 224, 224],
      "layout": "NCHW",
      "normalize": {
        "mean": [0.485, 0.456, 0.406],
        "std":  [0.229, 0.224, 0.225]
      }
    },
    "output": {
      "task": "multiclass",
      "shape": [1, 7],
      "classes": [
        "Actinic keratosis",
        "Basal cell carcinoma",
        "Benign keratosis",
        "Dermatofibroma",
        "Melanocytic nevi",
        "Melanoma",
        "Vascular lesion"
      ],
      "activation": "softmax",
      "labels": [
        { "name": "Actinic keratosis",    "threshold": 0.5, "suspicious": true  },
        { "name": "Basal cell carcinoma", "threshold": 0.5, "suspicious": true  },
        { "name": "Benign keratosis",     "threshold": 0.5, "suspicious": false },
        { "name": "Dermatofibroma",       "threshold": 0.5, "suspicious": false },
        { "name": "Melanocytic nevi",     "threshold": 0.5, "suspicious": false },
        { "name": "Melanoma",             "threshold": 0.5, "suspicious": true  },
        { "name": "Vascular lesion",      "threshold": 0.5, "suspicious": false }
      ]
    },
    "safety": {
      "tier": "screening",
      "disclaimer": "This is a screening support tool only. It does not diagnose cancer or any disease. Results require review by a qualified dermatologist. A possible finding does not confirm malignancy; a no-finding result does not rule out skin cancer."
    },
    "thresholds": {
      "possible_finding": 0.5,
      "low_confidence": 0.25,
      "validation_status": "unvalidated"
    },
    "source_model": {
      "family": "EfficientNet",
      "source": "HuggingFace: Anwarkh1/Skin_Cancer-Image_Classification — HAM10000 ISIC 2018 Task 3",
      "selected_findings": ["Actinic keratosis", "Basal cell carcinoma", "Melanoma"]
    },
    "explainability": {
      "enabled": true,
      "method": "occlusion_sensitivity",
      "isModelBased": true,
      "isGradCAM": false,
      "disclaimer": "This overlay highlights image regions that most influenced the model prediction. It is not a clinically validated saliency map."
    }
  }'::jsonb
FROM models WHERE slug = 'efficientnetb4-skin-ham10000'
ON CONFLICT (model_id, version) DO UPDATE SET
  clarity_url = EXCLUDED.clarity_url,
  model_url   = EXCLUDED.model_url,
  spec_json   = EXCLUDED.spec_json;

-- ─── Verify ──────────────────────────────────────────────────────────────────

SELECT
  m.slug,
  m.name,
  m.status,
  m.task,
  m.validation_status,
  m.safety_tier,
  COUNT(mv.id)            AS version_count,
  COUNT(mv.spec_json)     AS versions_with_spec,
  LEFT(mv.clarity_url, 45) AS clarity_url_preview
FROM models m
LEFT JOIN model_versions mv ON mv.model_id = m.id
GROUP BY m.id, mv.clarity_url
ORDER BY m.created_at DESC;
