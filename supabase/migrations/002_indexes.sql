CREATE INDEX IF NOT EXISTS idx_models_slug ON models(slug);
CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);
