import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  scrapeAgents,
  scrapeObservations,
  scrapeRuns,
  scrapeSources,
  scrapeTargets,
} from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { requireAdmin } from '#layer/server/utils/auth'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const parsed = paramsSchema.safeParse({
    id: getRouterParam(event, 'id'),
  })
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Invalid observation id' })
  }

  const db = useAppDatabase(event)

  const row = await db
    .select({
      id: scrapeObservations.id,
      observedAt: scrapeObservations.observedAt,
      createdAt: scrapeObservations.createdAt,
      contentHash: scrapeObservations.contentHash,
      qualityScore: scrapeObservations.qualityScore,
      strategy: scrapeObservations.strategy,
      artifactRef: scrapeObservations.artifactRef,
      payloadJson: scrapeObservations.payloadJson,
      targetId: scrapeTargets.id,
      normalizedUrl: scrapeTargets.normalizedUrl,
      targetLabel: scrapeTargets.label,
      targetExternalKey: scrapeTargets.externalKey,
      targetCreatedAt: scrapeTargets.createdAt,
      targetUpdatedAt: scrapeTargets.updatedAt,
      targetMetaJson: scrapeTargets.metaJson,
      sourceId: scrapeSources.id,
      sourceKey: scrapeSources.key,
      sourceLabel: scrapeSources.label,
      sourceDefaultTtlSeconds: scrapeSources.defaultTtlSeconds,
      runId: scrapeRuns.id,
      runStatus: scrapeRuns.status,
      runStartedAt: scrapeRuns.startedAt,
      runFinishedAt: scrapeRuns.finishedAt,
      runType: scrapeRuns.runType,
      runSourceDomain: scrapeRuns.sourceDomain,
      runConnectorKey: scrapeRuns.connectorKey,
      runRecordsCreated: scrapeRuns.recordsCreated,
      runRecordsUpdated: scrapeRuns.recordsUpdated,
      runRecordsSkipped: scrapeRuns.recordsSkipped,
      runParseErrorCount: scrapeRuns.parseErrorCount,
      runMetaJson: scrapeRuns.metaJson,
      agentId: scrapeAgents.id,
      agentHostname: scrapeAgents.hostname,
      agentVersion: scrapeAgents.clientVersion,
      agentLastSeenAt: scrapeAgents.lastSeenAt,
    })
    .from(scrapeObservations)
    .innerJoin(scrapeTargets, eq(scrapeObservations.targetId, scrapeTargets.id))
    .innerJoin(scrapeSources, eq(scrapeTargets.sourceId, scrapeSources.id))
    .innerJoin(scrapeRuns, eq(scrapeObservations.runId, scrapeRuns.id))
    .leftJoin(scrapeAgents, eq(scrapeRuns.agentId, scrapeAgents.id))
    .where(eq(scrapeObservations.id, parsed.data.id))
    .get()

  if (!row) {
    throw createError({ statusCode: 404, message: 'Observation not found' })
  }

  return {
    observation: {
      id: row.id,
      observedAt: row.observedAt,
      createdAt: row.createdAt,
      contentHash: row.contentHash,
      qualityScore: row.qualityScore,
      strategy: row.strategy,
      artifactRef: row.artifactRef,
      normalizedUrl: row.normalizedUrl,
      sourceKey: row.sourceKey,
      payload: parseJsonRecord(row.payloadJson) ?? {},
      targetId: row.targetId,
      targetLabel: row.targetLabel,
      targetExternalKey: row.targetExternalKey,
      targetCreatedAt: row.targetCreatedAt,
      targetUpdatedAt: row.targetUpdatedAt,
      targetMeta: parseJsonRecord(row.targetMetaJson),
      sourceId: row.sourceId,
      sourceLabel: row.sourceLabel,
      sourceDefaultTtlSeconds: row.sourceDefaultTtlSeconds,
      runId: row.runId,
      runStatus: row.runStatus,
      runStartedAt: row.runStartedAt,
      runFinishedAt: row.runFinishedAt,
      runType: row.runType,
      runSourceDomain: row.runSourceDomain,
      runConnectorKey: row.runConnectorKey,
      runRecordsCreated: row.runRecordsCreated,
      runRecordsUpdated: row.runRecordsUpdated,
      runRecordsSkipped: row.runRecordsSkipped,
      runParseErrorCount: row.runParseErrorCount,
      runMeta: parseJsonRecord(row.runMetaJson),
      agentId: row.agentId,
      agentHostname: row.agentHostname,
      agentVersion: row.agentVersion,
      agentLastSeenAt: row.agentLastSeenAt,
    },
  }
})
