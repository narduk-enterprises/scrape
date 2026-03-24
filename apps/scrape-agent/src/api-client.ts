/**
 * Typed HTTP client for the scrape backend API.
 *
 * Env:
 *   SCRAPE_API_BASE     — e.g. https://scrape.nard.uk or http://localhost:3000
 *   SCRAPE_AGENT_SECRET — must match server SCRAPE_AGENT_SECRET
 *   SCRAPE_AGENT_ID     — stable machine id (default: hostname)
 */
import { hostname } from 'node:os'
import { ingestBodySchema, type IngestBody } from '@narduk-enterprises/scrape-contract'

export interface WorkItem {
  targetId: string
  fingerprint: string
  normalizedUrl: string
  externalKey?: string
  label?: string
  meta?: Record<string, unknown>
  sourceKey: string
  defaultTtlSeconds: number
}

export interface IngestResult {
  runId: string
  observationsInserted: number
  observationsDeduped: number
}

export class ApiClient {
  readonly baseUrl: string
  readonly agentId: string
  readonly agentHostname: string
  readonly version = '0.1.0'
  private readonly secret: string

  constructor(opts: { baseUrl?: string; secret?: string; agentId?: string } = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.SCRAPE_API_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
    const s = opts.secret ?? process.env.SCRAPE_AGENT_SECRET ?? ''
    if (!s) throw new Error('SCRAPE_AGENT_SECRET is required')
    this.secret = s
    this.agentId = opts.agentId ?? process.env.SCRAPE_AGENT_ID ?? hostname() ?? 'unknown-agent'
    this.agentHostname = hostname() ?? 'unknown'
  }

  private headers(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.secret}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Scrape-Agent-Id': this.agentId,
    }
  }

  async heartbeat(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/scrape/agent/heartbeat`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        id: this.agentId,
        hostname: this.agentHostname,
        version: this.version,
      }),
    })
    if (!res.ok) throw new Error(`heartbeat ${res.status}: ${await res.text()}`)
  }

  async fetchWork(limit: number): Promise<WorkItem[]> {
    const res = await fetch(`${this.baseUrl}/api/scrape/agent/work?limit=${limit}`, {
      headers: this.headers(),
    })
    if (!res.ok) throw new Error(`work ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { work: WorkItem[] }
    return data.work
  }

  async ingest(body: IngestBody): Promise<IngestResult> {
    const parsed = ingestBodySchema.safeParse(body)
    if (!parsed.success) {
      const flat = parsed.error.flatten()
      throw new Error(`Invalid ingest payload: ${JSON.stringify(flat)}`)
    }
    const res = await fetch(`${this.baseUrl}/api/scrape/agent/ingest`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(parsed.data),
    })
    if (!res.ok) throw new Error(`ingest ${res.status}: ${await res.text()}`)
    return (await res.json()) as IngestResult
  }
}
