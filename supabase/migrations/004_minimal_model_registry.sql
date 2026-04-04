-- ClarityRay minimal model-registry schema (metadata only)
-- Safe for Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS models (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  modality    text,
  bodypart    text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version     text NOT NULL,
  clarity_url text NOT NULL,
  model_url   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_versions_model_id_version_key UNIQUE (model_id, version)
);

CREATE INDEX IF NOT EXISTS idx_models_slug ON models(slug);
CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);
