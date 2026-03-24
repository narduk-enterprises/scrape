import { eq } from 'drizzle-orm'
import {
  computeTargetFingerprint,
  enqueueTargetsBodySchema,
} from '@narduk-enterprises/scrape-contract'
import { scrapeSources, scrapeTargets } from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { SCRAPE_ADMIN_ENQUEUE_RATE_LIMIT } from '#server/utils/scrape-rate-limit'
import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'

export default defineAdminMutation(
  {
    rateLimit: SCRAPE_ADMIN_ENQUEUE_RATE_LIMIT,
    parseBody: withValidatedBody((b) => enqueueTargetsBodySchema.parse(b)),
  },
  async (ctx) => {
    const { event, body } = ctx
    const { sourceKey, sourceLabel, defaultTtlSeconds, targets } = body
    const db = useAppDatabase(event)
    const now = new Date().toISOString()

    let source = await db.select().from(scrapeSources).where(eq(scrapeSources.key, sourceKey)).get()
    if (!source) {
      const sid = crypto.randomUUID()
      await db.insert(scrapeSources).values({
        id: sid,
        key: sourceKey,
        label: sourceLabel ?? sourceKey,
        defaultTtlSeconds: defaultTtlSeconds ?? 86_400,
        createdAt: now,
      })
      source = await db.select().from(scrapeSources).where(eq(scrapeSources.key, sourceKey)).get()
    } else if (defaultTtlSeconds != null) {
      await db
        .update(scrapeSources)
        .set({ defaultTtlSeconds })
        .where(eq(scrapeSources.id, source.id))
        .run()
    }

    if (!source) {
      throw createError({ statusCode: 500, message: 'Failed to resolve source' })
    }

    let created = 0
    let existing = 0

    for (const t of targets) {
      const fingerprint =
        t.fingerprint ??
        (await computeTargetFingerprint({
          sourceKey,
          normalizedUrl: t.normalizedUrl,
          externalKey: t.externalKey,
        }))

      const prior = await db
        .select()
        .from(scrapeTargets)
        .where(eq(scrapeTargets.fingerprint, fingerprint))
        .get()
      if (prior) {
        existing += 1
        await db
          .update(scrapeTargets)
          .set({
            updatedAt: now,
            label: t.label ?? prior.label,
            metaJson: t.meta ? JSON.stringify(t.meta) : prior.metaJson,
          })
          .where(eq(scrapeTargets.id, prior.id))
          .run()
        continue
      }

      await db.insert(scrapeTargets).values({
        id: crypto.randomUUID(),
        sourceId: source.id,
        fingerprint,
        normalizedUrl: t.normalizedUrl,
        externalKey: t.externalKey ?? null,
        label: t.label ?? null,
        metaJson: t.meta ? JSON.stringify(t.meta) : null,
        createdAt: now,
        updatedAt: now,
      })
      created += 1
    }

    return { sourceKey, created, existing, total: targets.length }
  },
)
