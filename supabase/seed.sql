-- ClarityRay — full schema + seed data
-- Run this once in your Supabase Dashboard → SQL Editor.
-- It is idempotent: safe to re-run at any time.
--
-- What this does:
--   1. Ensures the base schema (migrations 001–004) exists
--   2. Applies migration 005 (task / validation_status / safety_tier columns)
--   3. Ensures the anon role can SELECT published models
--   4. Seeds all 5 bundled models with their versions

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

CREATE INDEX IF NOT EXISTS idx_models_slug           ON models(slug);
CREATE INDEX IF NOT EXISTS idx_models_status         ON models(status);
CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);

-- ─── 2. Migration 005 — task / validation / safety columns ──────────────────

ALTER TABLE models ADD COLUMN IF NOT EXISTS task              text NOT NULL DEFAULT 'binary';
ALTER TABLE models ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unvalidated';
ALTER TABLE models ADD COLUMN IF NOT EXISTS safety_tier       text NOT NULL DEFAULT 'screening';

CREATE INDEX IF NOT EXISTS idx_models_task             ON models(task);
CREATE INDEX IF NOT EXISTS idx_models_validation_status ON models(validation_status);

-- ─── 3. Row Level Security — allow anon to read published models ─────────────

ALTER TABLE models         ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;

-- Drop & recreate to stay idempotent
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

-- ─── 4. Seed models ──────────────────────────────────────────────────────────
-- Uses ON CONFLICT (slug) DO UPDATE so re-runs are safe.

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

-- ─── 5. Seed model_versions ──────────────────────────────────────────────────

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
SELECT id, '1.0.0',
  '/models/densenet121-chest/clarity.json',
  '/models/densenet121-chest/model.onnx'
FROM models WHERE slug = 'densenet121-chest'
ON CONFLICT (model_id, version) DO NOTHING;

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
SELECT id, '1.0.0',
  '/models/densenet121-cxr-suspicious/clarity.json',
  '/models/densenet121-cxr-suspicious/model.onnx'
FROM models WHERE slug = 'densenet121-cxr-suspicious'
ON CONFLICT (model_id, version) DO NOTHING;

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
SELECT id, '1.0.0',
  '/models/densenet121-cxr-suspicious-binary/clarity.json',
  '/models/densenet121-cxr-suspicious-binary/model.onnx'
FROM models WHERE slug = 'densenet121-cxr-suspicious-binary'
ON CONFLICT (model_id, version) DO NOTHING;

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
SELECT id, '1.0.0',
  '/models/densenet121-nih/clarity.json',
  '/models/densenet121-nih/model.onnx'
FROM models WHERE slug = 'densenet121-nih'
ON CONFLICT (model_id, version) DO NOTHING;

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
SELECT id, '1.0.0',
  '/models/brain-ctscan-cancer/clarity.json',
  '/models/brain-ctscan-cancer/model.onnx'
FROM models WHERE slug = 'brain-ctscan-cancer'
ON CONFLICT (model_id, version) DO NOTHING;

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
SELECT id, '1.0.0',
  '/models/resnet50-cxr-suspicious/clarity.json',
  '/models/resnet50-cxr-suspicious/model.onnx'
FROM models WHERE slug = 'resnet50-cxr-suspicious'
ON CONFLICT (model_id, version) DO NOTHING;

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
SELECT id, '1.0.0',
  'https://huggingface.co/Shub-19/SKin-cancer/resolve/main/efficientnetb4-skin-ham10000/clarity.json',
  'https://huggingface.co/Shub-19/SKin-cancer/resolve/main/efficientnetb4-skin-ham10000/model.onnx'
FROM models WHERE slug = 'efficientnetb4-skin-ham10000'
ON CONFLICT (model_id, version) DO NOTHING;

-- ─── Verify ──────────────────────────────────────────────────────────────────

SELECT
  m.slug,
  m.name,
  m.status,
  m.task,
  m.validation_status,
  m.safety_tier,
  COUNT(mv.id) AS version_count
FROM models m
LEFT JOIN model_versions mv ON mv.model_id = m.id
GROUP BY m.id
ORDER BY m.created_at DESC;
