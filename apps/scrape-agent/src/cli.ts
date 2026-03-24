#!/usr/bin/env node
/**
 * Local scrape worker CLI — talks to the Nuxt backend (Bearer SCRAPE_AGENT_SECRET).
 *
 * Env:
 *   SCRAPE_API_BASE            — e.g. https://scrape.nard.uk or http://localhost:3000
 *   SCRAPE_AGENT_SECRET        — must match server SCRAPE_AGENT_SECRET
 *   SCRAPE_AGENT_ID            — stable machine id (default: hostname)
 *   SCRAPE_POLL_INTERVAL       — worker poll interval in seconds (default 10)
 *   SCRAPE_MAX_POLL_INTERVAL   — max backoff ceiling in seconds (default 120)
 *   SCRAPE_CONCURRENCY         — parallel scrapes (default 5)
 *   SCRAPE_BATCH_SIZE          — work items per poll (default 25)
 *   SCRAPE_HEARTBEAT_INTERVAL  — heartbeat cadence in seconds (default 60)
 */
import { readFile } from 'node:fs/promises'
import { ApiClient } from './api-client.js'
import { scrapeWorkItem } from './scraper.js'
import { configFromEnv, runWorkerOnce, startWorker } from './worker.js'

function usage(): void {
  console.log(`scrape-agent — local scrape worker

Env: SCRAPE_API_BASE, SCRAPE_AGENT_SECRET, SCRAPE_AGENT_ID

Commands:
  run                    long-running worker: poll → scrape → ingest (main mode)
  once [limit]           one poll cycle: fetch work → scrape → ingest
  heartbeat              POST /api/scrape/agent/heartbeat
  work [limit]           GET /api/scrape/agent/work (default limit 25)
  scrape <url> [source]  scrape a single URL directly without polling the API
  ingest <file.json>     POST /api/scrape/agent/ingest (validated body)

Worker tunables (env, in seconds):
  SCRAPE_POLL_INTERVAL=10  SCRAPE_MAX_POLL_INTERVAL=120
  SCRAPE_CONCURRENCY=5     SCRAPE_BATCH_SIZE=25
  SCRAPE_HEARTBEAT_INTERVAL=60
`)
}

/** Strip pnpm's `--` and filter out the script path from argv. */
function userArgs(argv: string[]): string[] {
  const raw = argv.slice(2)
  const dash = raw.indexOf('--')
  if (dash >= 0) return raw.slice(dash + 1)
  return raw.filter((a) => !a.endsWith('cli.ts') && !a.endsWith('cli.js'))
}

async function main(): Promise<void> {
  const [cmd = 'help', ...rest] = userArgs(process.argv)

  switch (cmd) {
    case 'run': {
      await startWorker(configFromEnv())
      break
    }

    case 'once': {
      const limit = Number(rest[0]) || undefined
      const result = await runWorkerOnce(limit ? { batchSize: limit } : {})
      console.log(JSON.stringify(result ?? { workItemCount: 0 }, null, 2))
      break
    }

    case 'heartbeat': {
      const api = new ApiClient()
      await api.heartbeat()
      console.log('ok')
      break
    }

    case 'work': {
      const api = new ApiClient()
      const limit = Number(rest[0]) || 25
      const items = await api.fetchWork(limit)
      console.log(JSON.stringify({ work: items }, null, 2))
      break
    }

    case 'ingest': {
      const path = rest[0]
      if (!path) throw new Error('usage: scrape-agent ingest <file.json>')
      const api = new ApiClient()
      const raw = await readFile(path, 'utf8')
      const body = JSON.parse(raw) as unknown
      const out = await api.ingest(body as Parameters<ApiClient['ingest']>[0])
      console.log(JSON.stringify(out, null, 2))
      break
    }

    case 'scrape': {
      const normalizedUrl = rest[0]
      if (!normalizedUrl) {
        throw new Error('usage: scrape-agent scrape <url> [source]')
      }

      const outcome = await scrapeWorkItem({
        targetId: 'manual',
        fingerprint: 'manual',
        normalizedUrl,
        sourceKey: rest[1] ?? 'manual',
        defaultTtlSeconds: 0,
      })
      console.log(JSON.stringify(outcome, null, 2))
      break
    }

    default:
      usage()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
