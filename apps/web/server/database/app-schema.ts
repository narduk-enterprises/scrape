/**
 * App-owned database schema — competitive scrape intel (D1 / SQLite).
 *
 * Dedup model:
 * - scrape_sources: competitor / channel (key + default TTL for freshness).
 * - scrape_targets: one row per logical URL/product; unique fingerprint (precomputed by agent).
 * - scrape_runs: one batch execution from an agent.
 * - scrape_observations: facts extracted per target; UNIQUE(target_id, content_hash) avoids storing duplicate payloads.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const scrapeSources = sqliteTable('scrape_sources', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label'),
  /** Seconds between re-scrape suggestions when observation exists */
  defaultTtlSeconds: integer('default_ttl_seconds').notNull().default(86_400),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const scrapeTargets = sqliteTable(
  'scrape_targets',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => scrapeSources.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull().unique(),
    normalizedUrl: text('normalized_url').notNull(),
    externalKey: text('external_key'),
    label: text('label'),
    metaJson: text('meta_json'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    srcIdx: index('scrape_targets_source_idx').on(t.sourceId),
  }),
)

export const scrapeAgents = sqliteTable('scrape_agents', {
  id: text('id').primaryKey(),
  hostname: text('hostname'),
  lastSeenAt: text('last_seen_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  clientVersion: text('client_version'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const scrapeRuns = sqliteTable(
  'scrape_runs',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').references(() => scrapeAgents.id, { onDelete: 'set null' }),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    status: text('status').notNull(),
    metaJson: text('meta_json'),
    /** full_crawl | incremental | targeted | retry | manual */
    runType: text('run_type'),
    sourceDomain: text('source_domain'),
    connectorKey: text('connector_key'),
    recordsCreated: integer('records_created'),
    recordsUpdated: integer('records_updated'),
    recordsSkipped: integer('records_skipped'),
    parseErrorCount: integer('parse_error_count'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    agentIdx: index('scrape_runs_agent_idx').on(t.agentId),
    domainIdx: index('scrape_runs_domain_idx').on(t.sourceDomain),
    connectorIdx: index('scrape_runs_connector_idx').on(t.connectorKey),
  }),
)

export const scrapeObservations = sqliteTable(
  'scrape_observations',
  {
    id: text('id').primaryKey(),
    targetId: text('target_id')
      .notNull()
      .references(() => scrapeTargets.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: 'cascade' }),
    contentHash: text('content_hash').notNull(),
    payloadJson: text('payload_json').notNull(),
    qualityScore: integer('quality_score'),
    strategy: text('strategy'),
    artifactRef: text('artifact_ref'),
    observedAt: text('observed_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    targetContentUq: uniqueIndex('scrape_observations_target_content_uq').on(
      t.targetId,
      t.contentHash,
    ),
    targetObsIdx: index('scrape_observations_target_obs_idx').on(t.targetId, t.observedAt),
  }),
)

// ── Price Intelligence canonical schema ──────────────────────
export * from './pi-schema'

/** Optional work queue when you want explicit jobs instead of TTL-only polling */
export const scrapeJobs = sqliteTable(
  'scrape_jobs',
  {
    id: text('id').primaryKey(),
    targetId: text('target_id')
      .notNull()
      .references(() => scrapeTargets.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(0),
    status: text('status').notNull().default('pending'),
    leaseExpiresAt: integer('lease_expires_at'),
    assignedAgentId: text('assigned_agent_id'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => ({
    pendingIdx: index('scrape_jobs_status_pri_idx').on(t.status, t.priority),
  }),
)
