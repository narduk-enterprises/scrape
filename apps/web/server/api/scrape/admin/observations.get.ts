import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { scrapeObservations, scrapeSources, scrapeTargets } from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { requireAdmin } from '#layer/server/utils/auth'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sourceKey: z.string().max(128).optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = await getValidatedQuery(event, (q) => querySchema.safeParse(q))
  if (!query.success) {
    throw createError({ statusCode: 400, message: 'Invalid query' })
  }

  const { page, limit, sourceKey } = query.data
  const offset = (page - 1) * limit
  const db = useAppDatabase(event)

  const baseCount = db
    .select({ n: count() })
    .from(scrapeObservations)
    .innerJoin(scrapeTargets, eq(scrapeObservations.targetId, scrapeTargets.id))
    .innerJoin(scrapeSources, eq(scrapeTargets.sourceId, scrapeSources.id))

  const totalRow = await (
    sourceKey ? baseCount.where(eq(scrapeSources.key, sourceKey)) : baseCount
  ).get()

  const baseRows = db
    .select({
      id: scrapeObservations.id,
      observedAt: scrapeObservations.observedAt,
      contentHash: scrapeObservations.contentHash,
      qualityScore: scrapeObservations.qualityScore,
      strategy: scrapeObservations.strategy,
      normalizedUrl: scrapeTargets.normalizedUrl,
      sourceKey: scrapeSources.key,
      payloadJson: scrapeObservations.payloadJson,
    })
    .from(scrapeObservations)
    .innerJoin(scrapeTargets, eq(scrapeObservations.targetId, scrapeTargets.id))
    .innerJoin(scrapeSources, eq(scrapeTargets.sourceId, scrapeSources.id))

  const rows = await (sourceKey ? baseRows.where(eq(scrapeSources.key, sourceKey)) : baseRows)
    .orderBy(desc(scrapeObservations.observedAt))
    .limit(limit)
    .offset(offset)
    .all()

  return {
    observations: rows.map((r) => ({
      id: r.id,
      observedAt: r.observedAt,
      contentHash: r.contentHash,
      qualityScore: r.qualityScore,
      strategy: r.strategy,
      normalizedUrl: r.normalizedUrl,
      sourceKey: r.sourceKey,
      payload: JSON.parse(r.payloadJson) as Record<string, unknown>,
    })),
    total: Number(totalRow?.n ?? 0),
    page,
    limit,
  }
})
