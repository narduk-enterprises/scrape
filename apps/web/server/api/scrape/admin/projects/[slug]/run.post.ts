import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { scrapeJobs, scrapeSources, scrapeTargets } from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { SCRAPE_ADMIN_RUN_RATE_LIMIT } from '#server/utils/scrape-rate-limit'
import { defineAdminMutation } from '#layer/server/utils/mutation'

const paramsSchema = z.object({
  slug: z.string().min(1).max(128),
})

export default defineAdminMutation(
  {
    rateLimit: SCRAPE_ADMIN_RUN_RATE_LIMIT,
  },
  async ({ event }) => {
    const parsed = paramsSchema.safeParse({
      slug: getRouterParam(event, 'slug'),
    })
    if (!parsed.success) {
      throw createError({ statusCode: 400, message: 'Invalid project slug' })
    }

    const db = useAppDatabase(event)
    const now = new Date().toISOString()

    const project = await db.get<{
      id: string
      name: string
      slug: string
    }>(sql`
      SELECT id, name, slug
      FROM pi_projects
      WHERE slug = ${parsed.data.slug}
      LIMIT 1
    `)

    if (!project) {
      throw createError({ statusCode: 404, message: 'Project not found' })
    }

    const seedRows = await db.all<{
      source_key: string
      source_label: string | null
      default_ttl_seconds: number
      target_fingerprint: string
      normalized_url: string
      external_key: string | null
      label: string | null
      meta_json: string | null
    }>(sql`
      SELECT
        pc.source_key,
        pc.source_label,
        pc.default_ttl_seconds,
        pst.target_fingerprint,
        pst.normalized_url,
        pst.external_key,
        pst.label,
        pst.meta_json
      FROM pi_project_scrape_targets pst
      INNER JOIN pi_project_competitors pc ON pc.id = pst.competitor_id
      WHERE pst.project_id = ${project.id}
        AND COALESCE(pst.is_active, 1) = 1
        AND COALESCE(pc.is_active, 1) = 1
      ORDER BY pc.source_key ASC, COALESCE(pst.label, pst.normalized_url, '') ASC
    `)

    let createdTargets = 0
    let queuedJobs = 0
    let existingQueuedJobs = 0

    for (const row of seedRows) {
      let source = await db
        .select()
        .from(scrapeSources)
        .where(eq(scrapeSources.key, row.source_key))
        .get()
      if (!source) {
        const sourceId = crypto.randomUUID()
        await db.insert(scrapeSources).values({
          id: sourceId,
          key: row.source_key,
          label: row.source_label ?? row.source_key,
          defaultTtlSeconds: row.default_ttl_seconds,
          createdAt: now,
        })
        source = await db
          .select()
          .from(scrapeSources)
          .where(eq(scrapeSources.key, row.source_key))
          .get()
      }

      if (!source) {
        continue
      }

      let target = await db
        .select()
        .from(scrapeTargets)
        .where(eq(scrapeTargets.fingerprint, row.target_fingerprint))
        .get()

      if (!target) {
        await db.insert(scrapeTargets).values({
          id: crypto.randomUUID(),
          sourceId: source.id,
          fingerprint: row.target_fingerprint,
          normalizedUrl: row.normalized_url,
          externalKey: row.external_key,
          label: row.label,
          metaJson: row.meta_json,
          createdAt: now,
          updatedAt: now,
        })
        target = await db
          .select()
          .from(scrapeTargets)
          .where(eq(scrapeTargets.fingerprint, row.target_fingerprint))
          .get()
        createdTargets += 1
      }

      if (!target) {
        continue
      }

      const activeJob = await db.get<{
        id: string
        status: string
      }>(sql`
        SELECT id, status
        FROM scrape_jobs
        WHERE target_id = ${target.id}
          AND status IN ('pending', 'leased')
        ORDER BY datetime(updated_at) DESC
        LIMIT 1
      `)

      if (activeJob) {
        existingQueuedJobs += 1
        if (activeJob.status === 'pending') {
          await db
            .update(scrapeJobs)
            .set({
              priority: 100,
              updatedAt: now,
            })
            .where(eq(scrapeJobs.id, activeJob.id))
            .run()
        }
        continue
      }

      await db.insert(scrapeJobs).values({
        id: crypto.randomUUID(),
        targetId: target.id,
        priority: 100,
        status: 'pending',
        leaseExpiresAt: null,
        assignedAgentId: null,
        createdAt: now,
        updatedAt: now,
      })
      queuedJobs += 1
    }

    return {
      projectName: project.name,
      projectSlug: project.slug,
      requestedSeeds: seedRows.length,
      createdTargets,
      queuedJobs,
      existingQueuedJobs,
    }
  },
)
