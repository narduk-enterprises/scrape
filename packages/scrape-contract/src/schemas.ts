import { z } from 'zod'

export const agentIdentitySchema = z.object({
  id: z.string().min(1).max(128),
  hostname: z.string().max(256).optional(),
  version: z.string().max(64).optional(),
})

export const scrapeRunIngestSchema = z.object({
  id: z.string().uuid().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(['completed', 'partial', 'failed']),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const observationIngestSchema = z.object({
  sourceKey: z.string().min(1).max(128),
  fingerprint: z.string().length(64).regex(/^[0-9a-f]+$/),
  normalizedUrl: z.string().min(1).max(4096),
  externalKey: z.string().max(512).optional(),
  label: z.string().max(1024).optional(),
  targetMeta: z.record(z.string(), z.unknown()).optional(),
  contentHash: z.string().length(64).regex(/^[0-9a-f]+$/),
  payload: z.record(z.string(), z.unknown()),
  qualityScore: z.number().int().min(0).max(100).optional(),
  strategy: z.string().max(32).optional(),
  artifactRef: z.string().max(512).optional(),
  observedAt: z.string(),
})

export const ingestBodySchema = z.object({
  agent: agentIdentitySchema,
  run: scrapeRunIngestSchema,
  observations: z.array(observationIngestSchema).max(500),
})

export const enqueueTargetsBodySchema = z.object({
  sourceKey: z.string().min(1).max(128),
  sourceLabel: z.string().max(256).optional(),
  defaultTtlSeconds: z.number().int().min(60).max(86400 * 365).optional(),
  targets: z
    .array(
      z.object({
        normalizedUrl: z.string().min(1).max(4096),
        externalKey: z.string().max(512).optional(),
        label: z.string().max(1024).optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
        fingerprint: z
          .string()
          .length(64)
          .regex(/^[0-9a-f]+$/)
          .optional(),
      }),
    )
    .max(1000),
})

export type IngestBody = z.infer<typeof ingestBodySchema>
export type EnqueueTargetsBody = z.infer<typeof enqueueTargetsBodySchema>
