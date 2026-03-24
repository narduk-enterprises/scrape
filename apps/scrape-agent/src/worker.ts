/**
 * Long-running worker loop.
 *
 * 1. Sends periodic heartbeats to the backend.
 * 2. Polls for work items on an adaptive interval (backs off when idle).
 * 3. Processes items concurrently up to a configurable limit.
 * 4. Batches results into a single ingest call per cycle.
 * 5. Shuts down gracefully on SIGINT / SIGTERM.
 *
 * Env tunables (all in seconds unless noted):
 *   SCRAPE_POLL_INTERVAL       — base poll interval (default 10)
 *   SCRAPE_MAX_POLL_INTERVAL   — max backoff ceiling (default 120)
 *   SCRAPE_CONCURRENCY         — parallel scrapes (default 5)
 *   SCRAPE_BATCH_SIZE          — work items per poll (default 25)
 *   SCRAPE_HEARTBEAT_INTERVAL  — heartbeat cadence (default 60)
 */
import type { IngestBody } from '@narduk-enterprises/scrape-contract'
import { ApiClient, type WorkItem } from './api-client.js'
import { scrapeWorkItem, type ScrapeOutcome, type ScrapeSuccess } from './scraper.js'

export interface WorkerConfig {
  pollIntervalMs: number
  maxPollIntervalMs: number
  concurrency: number
  batchSize: number
  heartbeatIntervalMs: number
}

const DEFAULTS: WorkerConfig = {
  pollIntervalMs: 10_000,
  maxPollIntervalMs: 120_000,
  concurrency: 5,
  batchSize: 25,
  heartbeatIntervalMs: 60_000,
}

export function configFromEnv(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    pollIntervalMs: envInt('SCRAPE_POLL_INTERVAL', 10) * 1000,
    maxPollIntervalMs: envInt('SCRAPE_MAX_POLL_INTERVAL', 120) * 1000,
    concurrency: envInt('SCRAPE_CONCURRENCY', 5),
    batchSize: envInt('SCRAPE_BATCH_SIZE', 25),
    heartbeatIntervalMs: envInt('SCRAPE_HEARTBEAT_INTERVAL', 60) * 1000,
    ...overrides,
  }
}

// ── Main entry ───────────────────────────────────────────────

export interface WorkerCycleResult {
  deduped: number
  failures: number
  inserted: number
  outcomes: ScrapeOutcome[]
  runId: string | null
  workItemCount: number
}

export async function startWorker(config: WorkerConfig = DEFAULTS): Promise<void> {
  const api = new ApiClient()

  let running = true
  let pollInterval = config.pollIntervalMs

  const shutdown = () => {
    if (!running) return
    running = false
    log('info', 'Shutdown signal received — finishing in-flight work…')
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  log(
    'info',
    [
      `Worker started`,
      `agent=${api.agentId}`,
      `api=${api.baseUrl}`,
      `poll=${s(config.pollIntervalMs)}`,
      `max_poll=${s(config.maxPollIntervalMs)}`,
      `concurrency=${config.concurrency}`,
      `batch=${config.batchSize}`,
    ].join('  '),
  )

  try {
    await api.heartbeat()
    log('info', 'Heartbeat OK')
  } catch (e) {
    log('error', `Initial heartbeat failed: ${fmt(e)}`)
  }

  const hbTimer = setInterval(async () => {
    try {
      await api.heartbeat()
    } catch (e) {
      log('warn', `Heartbeat failed: ${fmt(e)}`)
    }
  }, config.heartbeatIntervalMs)

  while (running) {
    try {
      const items = await api.fetchWork(config.batchSize)

      if (items.length === 0) {
        pollInterval = Math.min(Math.round(pollInterval * 1.5), config.maxPollIntervalMs)
        log('info', `No work (next poll in ${s(pollInterval)})`)
        await interruptibleSleep(pollInterval, () => !running)
        continue
      }

      pollInterval = config.pollIntervalMs
      log('info', `Received ${items.length} work item(s)`)

      const cycle = await runWorkerCycle(api, items, config.concurrency)
      if (cycle.failures > 0) {
        log('warn', `${cycle.failures}/${cycle.outcomes.length} scrape(s) failed`)
      }
      if (cycle.runId) {
        log(
          'info',
          `Ingested: ${cycle.inserted} new, ${cycle.deduped} deduped (run ${cycle.runId})`,
        )
      }

      if (running) await interruptibleSleep(config.pollIntervalMs, () => !running)
    } catch (e) {
      log('error', `Poll cycle error: ${fmt(e)}`)
      pollInterval = Math.min(pollInterval * 2, config.maxPollIntervalMs)
      await interruptibleSleep(pollInterval, () => !running)
    }
  }

  clearInterval(hbTimer)
  log('info', 'Worker stopped')
}

export async function runWorkerOnce(
  config: Partial<WorkerConfig> = {},
): Promise<WorkerCycleResult | null> {
  const resolvedConfig = { ...DEFAULTS, ...config }
  const api = new ApiClient()

  await api.heartbeat()
  const items = await api.fetchWork(resolvedConfig.batchSize)
  if (items.length === 0) {
    return null
  }

  return runWorkerCycle(api, items, resolvedConfig.concurrency)
}

// ── Concurrency pool ─────────────────────────────────────────

async function runWorkerCycle(
  api: ApiClient,
  items: WorkItem[],
  concurrency: number,
): Promise<WorkerCycleResult> {
  const startedAt = new Date().toISOString()
  const outcomes = await processPool(items, concurrency)
  const finishedAt = new Date().toISOString()

  const successes = outcomes.filter((outcome): outcome is ScrapeSuccess => outcome.ok)
  const failures = outcomes.filter((outcome) => !outcome.ok)

  if (successes.length === 0) {
    return {
      deduped: 0,
      failures: failures.length,
      inserted: 0,
      outcomes,
      runId: null,
      workItemCount: items.length,
    }
  }

  const status = failures.length === 0 ? 'completed' : 'partial'
  const body: IngestBody = {
    agent: { id: api.agentId, hostname: api.agentHostname, version: api.version },
    run: { startedAt, finishedAt, status: status as 'completed' | 'partial' },
    observations: successes.map((result) => result.observation),
  }

  const res = await api.ingest(body)
  return {
    deduped: res.observationsDeduped,
    failures: failures.length,
    inserted: res.observationsInserted,
    outcomes,
    runId: res.runId,
    workItemCount: items.length,
  }
}

async function processPool(items: WorkItem[], concurrency: number): Promise<ScrapeOutcome[]> {
  const results: ScrapeOutcome[] = []
  const queue = [...items]

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!
      log('info', `  → ${item.normalizedUrl}`)
      const outcome = await scrapeWorkItem(item)
      if (!outcome.ok) {
        log('warn', `  ✗ ${item.normalizedUrl} — ${outcome.error}`)
      }
      results.push(outcome)
    }
  })

  await Promise.all(workers)
  return results
}

// ── Utilities ────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', msg: string): void {
  const ts = new Date().toISOString()
  const tag = level === 'error' ? 'ERR' : level === 'warn' ? 'WRN' : 'INF'
  const out = level === 'error' ? process.stderr : process.stdout
  out.write(`[${ts}] ${tag}  ${msg}\n`)
}

async function interruptibleSleep(ms: number, shouldStop: () => boolean): Promise<void> {
  const step = 500
  let elapsed = 0
  while (elapsed < ms && !shouldStop()) {
    await new Promise<void>((r) => setTimeout(r, Math.min(step, ms - elapsed)))
    elapsed += step
  }
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function s(ms: number): string {
  return `${Math.round(ms / 1000)}s`
}
function fmt(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
