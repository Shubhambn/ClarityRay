-- ClarityRay model registry seed (generated from public/models/).
-- Idempotent: safe to re-run. Paste into Supabase SQL Editor (runs as owner, bypasses RLS).

-- densenet121-chest
INSERT INTO models (slug, name, bodypart, modality, status)
VALUES ('densenet121-chest', 'DenseNet121 Chest X-ray Binary Classifier', 'chest', 'xray', 'published')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, bodypart = EXCLUDED.bodypart,
      modality = EXCLUDED.modality, status = 'published';

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
VALUES ((SELECT id FROM models WHERE slug = 'densenet121-chest'), '1.0.0', '/models/densenet121-chest/clarity.json', '/models/densenet121-chest/model.onnx')
ON CONFLICT (model_id, version) DO UPDATE
  SET clarity_url = EXCLUDED.clarity_url, model_url = EXCLUDED.model_url;

-- densenet121-cxr-suspicious
INSERT INTO models (slug, name, bodypart, modality, status)
VALUES ('densenet121-cxr-suspicious', 'DenseNet121 CXR Suspicious Finding Demo', 'chest', 'xray', 'published')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, bodypart = EXCLUDED.bodypart,
      modality = EXCLUDED.modality, status = 'published';

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
VALUES ((SELECT id FROM models WHERE slug = 'densenet121-cxr-suspicious'), '1.0.0', '/models/densenet121-cxr-suspicious/clarity.json', '/models/densenet121-cxr-suspicious/model.onnx')
ON CONFLICT (model_id, version) DO UPDATE
  SET clarity_url = EXCLUDED.clarity_url, model_url = EXCLUDED.model_url;

-- resnet50-cxr-suspicious
INSERT INTO models (slug, name, bodypart, modality, status)
VALUES ('resnet50-cxr-suspicious', 'ResNet50 CXR Suspicious Finding Demo', 'chest', 'xray', 'published')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, bodypart = EXCLUDED.bodypart,
      modality = EXCLUDED.modality, status = 'published';

INSERT INTO model_versions (model_id, version, clarity_url, model_url)
VALUES ((SELECT id FROM models WHERE slug = 'resnet50-cxr-suspicious'), '1.0.0', '/models/resnet50-cxr-suspicious/clarity.json', '/models/resnet50-cxr-suspicious/model.onnx')
ON CONFLICT (model_id, version) DO UPDATE
  SET clarity_url = EXCLUDED.clarity_url, model_url = EXCLUDED.model_url;

