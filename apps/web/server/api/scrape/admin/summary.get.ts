import { count, sql } from 'drizzle-orm'
import {
  scrapeAgents,
  scrapeObservations,
  scrapeRuns,
  scrapeSources,
  scrapeTargets,
} from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { requireAdmin } from '#layer/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = useAppDatabase(event)

  const [sources, targets, observations, runs, agents] = await Promise.all([
    db.select({ n: count() }).from(scrapeSources).get(),
    db.select({ n: count() }).from(scrapeTargets).get(),
    db.select({ n: count() }).from(scrapeObservations).get(),
    db.select({ n: count() }).from(scrapeRuns).get(),
    db.select({ n: count() }).from(scrapeAgents).get(),
  ])

  const staleRow = await db.get<{ n: number }>(sql`
    SELECT COUNT(*) AS n
    FROM scrape_targets t
    INNER JOIN scrape_sources s ON s.id = t.source_id
    WHERE NOT EXISTS (
      SELECT 1 FROM scrape_observations o
      WHERE o.target_id = t.id
        AND datetime(o.observed_at) > datetime('now', '-' || CAST(s.default_ttl_seconds AS TEXT) || ' seconds')
    )
  `)

  return {
    counts: {
      sources: Number(sources?.n ?? 0),
      targets: Number(targets?.n ?? 0),
      observations: Number(observations?.n ?? 0),
      runs: Number(runs?.n ?? 0),
      agents: Number(agents?.n ?? 0),
      targetsNeedingWork: Number(staleRow?.n ?? 0),
    },
  }
})
