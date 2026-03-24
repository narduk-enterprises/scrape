import type { RateLimitPolicy } from '#layer/server/utils/rateLimit'

export const SCRAPE_AGENT_HEARTBEAT_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'scrape-agent-heartbeat',
  maxRequests: 600,
  windowMs: 60_000,
}

export const SCRAPE_AGENT_INGEST_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'scrape-agent-ingest',
  maxRequests: 200,
  windowMs: 60_000,
}

export const SCRAPE_ADMIN_ENQUEUE_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'scrape-admin-enqueue',
  maxRequests: 40,
  windowMs: 60_000,
}

export const SCRAPE_ADMIN_RUN_RATE_LIMIT: RateLimitPolicy = {
  namespace: 'scrape-admin-run',
  maxRequests: 40,
  windowMs: 60_000,
}
