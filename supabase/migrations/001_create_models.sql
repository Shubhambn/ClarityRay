CREATE TABLE models (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  bodypart     text not null,
  modality     text not null,
  status       text not null default 'pending'
               check (status in ('pending','validated','published','deprecated')),
  submitted_at timestamptz default now(),
  published_at timestamptz
);

CREATE TABLE model_versions (
  id           uuid primary key default gen_random_uuid(),
  model_id     uuid references models(id) on delete cascade,
  version      text not null,
  onnx_key     text not null,
  spec_key     text not null,
  file_size_mb float,
  is_current   boolean default false,
  created_at   timestamptz default now()
);

CREATE TABLE validation_runs (
  id               uuid primary key default gen_random_uuid(),
  model_version_id uuid references model_versions(id),
  ran_at           timestamptz default now(),
  passed           boolean not null,
  checks           jsonb not null,
  onnxruntime_ver  text
);
