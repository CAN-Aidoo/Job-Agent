-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users table
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ
);

-- Profiles table
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Resume variants
CREATE TABLE resume_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  file_path       VARCHAR(500) NOT NULL,
  embedding       vector(1536),
  metadata        JSONB
);

-- Runs
CREATE TABLE runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_date        DATE NOT NULL,
  phase           VARCHAR(20) NOT NULL,
  state           VARCHAR(30) NOT NULL DEFAULT 'ready',
  current_step    VARCHAR(100),
  current_step_index INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  UNIQUE(user_id, run_date, phase)
);

-- Job postings
CREATE TABLE job_postings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(50) NOT NULL,
  source_id       VARCHAR(200) NOT NULL,
  canonical_key   VARCHAR(500) NOT NULL,
  company         VARCHAR(200) NOT NULL,
  role_title      VARCHAR(300) NOT NULL,
  data            JSONB NOT NULL,
  authenticity    VARCHAR(20),
  authenticity_signals JSONB,
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source, source_id)
);

CREATE INDEX idx_postings_canonical ON job_postings(canonical_key);
CREATE INDEX idx_postings_canonical_trgm ON job_postings USING gin (canonical_key gin_trgm_ops);

-- Application drafts
CREATE TABLE application_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  posting_id      UUID NOT NULL REFERENCES job_postings(id),
  match_score     FLOAT NOT NULL,
  match_breakdown JSONB,
  resume_variant_id UUID REFERENCES resume_variants(id),
  cover_letter    TEXT,
  screening_answers JSONB,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending_review',
  user_feedback   TEXT,
  approved_at     TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  submission_receipt JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drafts_pending ON application_drafts(user_id, status)
  WHERE status = 'pending_review';

CREATE INDEX idx_drafts_user_posting ON application_drafts(user_id, posting_id);

-- Inbox events
CREATE TABLE inbox_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_id        VARCHAR(200) NOT NULL,
  classified_as   VARCHAR(50),
  related_draft_id UUID REFERENCES application_drafts(id),
  parsed_data     JSONB,
  raw_subject     TEXT,
  raw_from        VARCHAR(300),
  received_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calendar events
CREATE TABLE calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inbox_event_id  UUID REFERENCES inbox_events(id),
  google_event_id VARCHAR(200),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  title           TEXT NOT NULL,
  prep_notes      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step outputs
CREATE TABLE step_outputs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_name       VARCHAR(100) NOT NULL,
  agent_name      VARCHAR(100) NOT NULL,
  output_data     JSONB,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, step_name)
);

-- Activity log
CREATE TABLE activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_id        UUID REFERENCES application_drafts(id),
  event_type      VARCHAR(50) NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);

-- Schema migrations tracking
CREATE TABLE schema_migrations (
  id              SERIAL PRIMARY KEY,
  filename        VARCHAR(255) NOT NULL UNIQUE,
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
