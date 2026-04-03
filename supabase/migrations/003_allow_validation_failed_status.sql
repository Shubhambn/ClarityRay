ALTER TABLE models DROP CONSTRAINT IF EXISTS models_status_check;

ALTER TABLE models
ADD CONSTRAINT models_status_check
CHECK (status IN ('pending', 'validated', 'validation_failed', 'published', 'deprecated'));
