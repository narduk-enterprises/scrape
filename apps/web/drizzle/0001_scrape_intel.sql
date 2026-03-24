-- Competitive scrape intel: sources, targets, runs, observations (dedupe by target + content hash).

CREATE TABLE scrape_sources (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  label TEXT,
  default_ttl_seconds INTEGER NOT NULL DEFAULT 86400,
  created_at TEXT NOT NULL
);

CREATE TABLE scrape_agents (
  id TEXT PRIMARY KEY NOT NULL,
  hostname TEXT,
  last_seen_at TEXT NOT NULL,
  client_version TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE scrape_targets (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL REFERENCES scrape_sources (id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL UNIQUE,
  normalized_url TEXT NOT NULL,
  external_key TEXT,
  label TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX scrape_targets_source_idx ON scrape_targets (source_id);

CREATE TABLE scrape_runs (
  id TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT REFERENCES scrape_agents (id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX scrape_runs_agent_idx ON scrape_runs (agent_id);

CREATE TABLE scrape_observations (
  id TEXT PRIMARY KEY NOT NULL,
  target_id TEXT NOT NULL REFERENCES scrape_targets (id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES scrape_runs (id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  quality_score INTEGER,
  strategy TEXT,
  artifact_ref TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX scrape_observations_target_content_uq ON scrape_observations (target_id, content_hash);

CREATE INDEX scrape_observations_target_obs_idx ON scrape_observations (target_id, observed_at);

CREATE TABLE scrape_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  target_id TEXT NOT NULL REFERENCES scrape_targets (id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  lease_expires_at INTEGER,
  assigned_agent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX scrape_jobs_status_pri_idx ON scrape_jobs (status, priority);
