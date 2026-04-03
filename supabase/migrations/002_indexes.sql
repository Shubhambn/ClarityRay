CREATE INDEX idx_models_status ON models(status);
CREATE INDEX idx_models_bodypart ON models(bodypart);
CREATE INDEX idx_models_modality ON models(modality);
CREATE INDEX idx_model_versions_model_id ON model_versions(model_id);
CREATE INDEX idx_model_versions_is_current ON model_versions(is_current) WHERE is_current = true;
