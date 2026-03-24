import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'

/**
 * Shared secret for scrape workers (env SCRAPE_AGENT_SECRET).
 * Authorization: Bearer <secret>
 */
export function requireScrapeAgent(event: H3Event): void {
  const expected = useRuntimeConfig(event).scrapeAgentSecret as string | undefined
  if (!expected) {
    throw createError({
      statusCode: 503,
      message: 'Scrape agent auth is not configured (SCRAPE_AGENT_SECRET).',
    })
  }

  const authHeader = getRequestHeader(event, 'authorization')
  const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!raw || raw !== expected) {
    throw createError({ statusCode: 401, message: 'Invalid scrape agent token.' })
  }
}
