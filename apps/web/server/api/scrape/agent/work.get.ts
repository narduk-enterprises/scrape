import { sql } from 'drizzle-orm'
import { z } from 'zod'
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
