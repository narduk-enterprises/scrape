import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { scrapeJobs } from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { requireScrapeAgent } from '#server/utils/scrape-agent-auth'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
})

/**
 * Targets that need work: no fresh observation within each source's TTL window.
 */
export default defineEventHandler(async (event) => {
  requireScrapeAgent(event)

  const query = await getValidatedQuery(event, (q) => querySchema.safeParse(q))
  if (!query.success) {
    throw createError({ statusCode: 400, message: 'Invalid query' })
  }

  const db = useAppDatabase(event)
  const limit = query.data.limit
  const now = new Date().toISOString()
  const leaseExpiresAt = Math.floor(Date.now() / 1000) + 10 * 60
  const agentId = getRequestHeader(event, 'x-scrape-agent-id')?.trim() || 'unknown-agent'

  const queuedRows = await db.all<{
    job_id: string
    id: string
    fingerprint: string
    normalized_url: string
    external_key: string | null
    label: string | null
    meta_json: string | null
    source_key: string
    default_ttl_seconds: number
  }>(sql`
    SELECT
      j.id AS job_id,
      t.id,
      t.fingerprint,
      t.normalized_url,
      t.external_key,
      t.label,
      t.meta_json,
      s.key AS source_key,
      s.default_ttl_seconds
    FROM scrape_jobs j
    INNER JOIN scrape_targets t ON t.id = j.target_id
    INNER JOIN scrape_sources s ON s.id = t.source_id
    WHERE j.status = 'pending'
       OR (j.status = 'leased' AND COALESCE(j.lease_expires_at, 0) < unixepoch())
    ORDER BY j.priority DESC, datetime(j.updated_at) ASC
    LIMIT ${limit}
  `)

  if (queuedRows.length > 0) {
    for (const row of queuedRows) {
      await db
        .update(scrapeJobs)
        .set({
          status: 'leased',
          leaseExpiresAt,
          assignedAgentId: agentId,
          updatedAt: now,
        })
        .where(eq(scrapeJobs.id, row.job_id))
        .run()
    }

    return {
      work: queuedRows.map((row) => ({
        targetId: row.id,
        fingerprint: row.fingerprint,
        normalizedUrl: row.normalized_url,
        externalKey: row.external_key ?? undefined,
        label: row.label ?? undefined,
        meta: row.meta_json ? (JSON.parse(row.meta_json) as Record<string, unknown>) : undefined,
        sourceKey: row.source_key,
        defaultTtlSeconds: row.default_ttl_seconds,
      })),
    }
  }

  const rows = await db.all<{
    id: string
    fingerprint: string
    normalized_url: string
    external_key: string | null
    label: string | null
    meta_json: string | null
    source_key: string
    default_ttl_seconds: number
  }>(sql`
    SELECT
      t.id,
      t.fingerprint,
      t.normalized_url,
      t.external_key,
      t.label,
      t.meta_json,
      s.key AS source_key,
      s.default_ttl_seconds
    FROM scrape_targets t
    INNER JOIN scrape_sources s ON s.id = t.source_id
    WHERE NOT EXISTS (
      SELECT 1 FROM scrape_observations o
      WHERE o.target_id = t.id
        AND datetime(o.observed_at) > datetime('now', '-' || CAST(s.default_ttl_seconds AS TEXT) || ' seconds')
    )
    ORDER BY t.updated_at ASC
    LIMIT ${limit}
  `)

  return {
    work: rows.map((r) => ({
      targetId: r.id,
      fingerprint: r.fingerprint,
      normalizedUrl: r.normalized_url,
      externalKey: r.external_key ?? undefined,
      label: r.label ?? undefined,
      meta: r.meta_json ? (JSON.parse(r.meta_json) as Record<string, unknown>) : undefined,
      sourceKey: r.source_key,
      defaultTtlSeconds: r.default_ttl_seconds,
    })),
  }
})
