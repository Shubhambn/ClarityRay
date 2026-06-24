-- Migration 006: store the full clarity.json spec as JSONB in model_versions.
-- The spec_json column is the canonical in-database source of truth for a
-- model's ClaritySpec. The Next.js route /api/models/[slug]/spec reads it and
-- returns it directly to the client, eliminating the dependency on local
-- public/models/**  files in deployed environments.
--
-- Existing rows keep spec_json = NULL until backfilled by seed.sql or by a
-- clarityray register run. The /api/models/[slug]/spec route degrades gracefully:
-- when spec_json IS NULL but clarity_url is an absolute URL it proxies that URL.

ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS spec_json jsonb;

-- Allow full-text search on spec data (e.g. search by class name in the future).
CREATE INDEX IF NOT EXISTS idx_model_versions_spec_json
  ON model_versions USING gin(spec_json)
  WHERE spec_json IS NOT NULL;
