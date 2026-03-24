import { and, eq, inArray } from 'drizzle-orm'
import { ingestBodySchema } from '@narduk-enterprises/scrape-contract'
import {
  scrapeAgents,
  scrapeJobs,
  scrapeObservations,
  scrapeRuns,
  scrapeSources,
  scrapeTargets,
} from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { requireScrapeAgent } from '#server/utils/scrape-agent-auth'
import { SCRAPE_AGENT_INGEST_RATE_LIMIT } from '#server/utils/scrape-rate-limit'
import { defineWebhookMutation, withValidatedBody } from '#layer/server/utils/mutation'

export default defineWebhookMutation(
  {
    rateLimit: SCRAPE_AGENT_INGEST_RATE_LIMIT,
    parseBody: withValidatedBody((b) => ingestBodySchema.parse(b)),
  },
  async ({ event, body }) => {
    requireScrapeAgent(event)

    const { agent, run, observations } = body
    const db = useAppDatabase(event)
    const now = new Date().toISOString()
    const runId = run.id ?? crypto.randomUUID()

    await db
      .insert(scrapeAgents)
      .values({
        id: agent.id,
        hostname: agent.hostname ?? null,
        clientVersion: agent.version ?? null,
        lastSeenAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: scrapeAgents.id,
        set: {
          lastSeenAt: now,
          hostname: agent.hostname ?? null,
          clientVersion: agent.version ?? null,
        },
      })

    await db.insert(scrapeRuns).values({
      id: runId,
      agentId: agent.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? now,
      status: run.status,
      metaJson: run.meta ? JSON.stringify(run.meta) : null,
      createdAt: now,
    })

    let inserted = 0
    let deduped = 0

    for (const obs of observations) {
      let source = await db
        .select()
        .from(scrapeSources)
        .where(eq(scrapeSources.key, obs.sourceKey))
        .get()
      if (!source) {
        const sid = crypto.randomUUID()
        await db
          .insert(scrapeSources)
          .values({
            id: sid,
            key: obs.sourceKey,
            label: obs.sourceKey,
            defaultTtlSeconds: 86_400,
            createdAt: now,
          })
          .onConflictDoNothing({ target: scrapeSources.key })
        source = await db
          .select()
          .from(scrapeSources)
          .where(eq(scrapeSources.key, obs.sourceKey))
          .get()
      }
      if (!source) continue

      await db
        .insert(scrapeTargets)
        .values({
          id: crypto.randomUUID(),
          sourceId: source.id,
          fingerprint: obs.fingerprint,
          normalizedUrl: obs.normalizedUrl,
          externalKey: obs.externalKey ?? null,
          label: obs.label ?? null,
          metaJson: obs.targetMeta ? JSON.stringify(obs.targetMeta) : null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: scrapeTargets.fingerprint })

      const target = await db
        .select()
        .from(scrapeTargets)
        .where(eq(scrapeTargets.fingerprint, obs.fingerprint))
        .get()
      if (!target) continue

      const existingObs = await db
        .select({ id: scrapeObservations.id })
        .from(scrapeObservations)
        .where(
          and(
            eq(scrapeObservations.targetId, target.id),
            eq(scrapeObservations.contentHash, obs.contentHash),
          ),
        )
        .get()

      await db
        .update(scrapeJobs)
        .set({
          status: 'completed',
          leaseExpiresAt: null,
          assignedAgentId: agent.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(scrapeJobs.targetId, target.id),
            inArray(scrapeJobs.status, ['pending', 'leased']),
          ),
        )
        .run()

      if (existingObs) {
        deduped += 1
        continue
      }

      await db.insert(scrapeObservations).values({
        id: crypto.randomUUID(),
        targetId: target.id,
        runId,
        contentHash: obs.contentHash,
        payloadJson: JSON.stringify(obs.payload),
        qualityScore: obs.qualityScore ?? null,
        strategy: obs.strategy ?? null,
        artifactRef: obs.artifactRef ?? null,
        observedAt: obs.observedAt,
        createdAt: now,
      })

      await db
        .update(scrapeTargets)
        .set({ updatedAt: now })
        .where(eq(scrapeTargets.id, target.id))
        .run()

      inserted += 1
    }

    return {
      runId,
      observationsInserted: inserted,
      observationsDeduped: deduped,
    }
  },
)
