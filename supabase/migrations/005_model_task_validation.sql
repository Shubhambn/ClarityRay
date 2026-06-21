-- Phase 4 (docs/marketplace.md): marketplace integrity & discovery.
-- Surface each model's output contract (task) and its real validation/safety
-- status so /models can filter on them and never let an unvalidated model look
-- cleared. These mirror fields the author already declares in clarity.json.

ALTER TABLE models ADD COLUMN IF NOT EXISTS task text NOT NULL DEFAULT 'binary';
ALTER TABLE models ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unvalidated';
ALTER TABLE models ADD COLUMN IF NOT EXISTS safety_tier text NOT NULL DEFAULT 'screening';

-- Filter-friendly indexes for the discovery endpoint.
CREATE INDEX IF NOT EXISTS idx_models_task ON models(task);
CREATE INDEX IF NOT EXISTS idx_models_validation_status ON models(validation_status);
