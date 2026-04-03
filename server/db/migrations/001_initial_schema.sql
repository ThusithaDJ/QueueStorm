-- ═══════════════════════════════════════════════════════════════════
-- QueueStorm — Initial Schema  (migration 001)
-- ═══════════════════════════════════════════════════════════════════

-- ── Migrations tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Environments ─────────────────────────────────────────────────────────────
-- Named broker connection profiles (dev, QA, staging, prod …)
-- Credentials are stored AES-256-GCM encrypted (see server/crypto/vault.js).
CREATE TABLE IF NOT EXISTS environments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  broker_type     TEXT        NOT NULL,          -- rabbitmq | activemq | kafka …
  protocol        TEXT        NOT NULL,
  host            TEXT,
  port            INTEGER,
  -- Broker-specific fields stored as encrypted JSON blob
  credentials_enc TEXT        NOT NULL DEFAULT '{}',  -- AES-GCM ciphertext (JSON)
  extra_config    JSONB       NOT NULL DEFAULT '{}',  -- non-sensitive extras (vhost, groupId …)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Test Profiles ─────────────────────────────────────────────────────────────
-- Saved load-test configurations that can be reloaded.
CREATE TABLE IF NOT EXISTS test_profiles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  environment_id  UUID        REFERENCES environments(id) ON DELETE SET NULL,
  -- All test parameters stored as JSONB for flexibility
  config          JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Test Runs ─────────────────────────────────────────────────────────────────
-- Each execution of a load test creates one row here.
CREATE TABLE IF NOT EXISTS test_runs (
  id              UUID        PRIMARY KEY,            -- same as job id
  profile_id      UUID        REFERENCES test_profiles(id) ON DELETE SET NULL,
  environment_id  UUID        REFERENCES environments(id) ON DELETE SET NULL,
  broker_type     TEXT        NOT NULL,
  config          JSONB       NOT NULL DEFAULT '{}',  -- snapshot at run time
  status          TEXT        NOT NULL DEFAULT 'pending',  -- pending|running|completed|stopped|error
  started_at      TIMESTAMPTZ,
  stopped_at      TIMESTAMPTZ,
  -- Aggregate stats (updated as the run progresses / on completion)
  total_sent      INTEGER     NOT NULL DEFAULT 0,
  total_acked     INTEGER     NOT NULL DEFAULT 0,
  total_dropped   INTEGER     NOT NULL DEFAULT 0,
  avg_latency_ms  NUMERIC(10,2),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Message Logs ──────────────────────────────────────────────────────────────
-- Individual message-level log entries (last ~1 000 per run kept in DB).
CREATE TABLE IF NOT EXISTS message_logs (
  id          BIGSERIAL   PRIMARY KEY,
  run_id      UUID        NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  msg_id      TEXT        NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latency_ms  INTEGER,
  status      TEXT        NOT NULL DEFAULT 'ok',   -- ok | warn | err
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_message_logs_run_id ON message_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status    ON test_runs(status);
