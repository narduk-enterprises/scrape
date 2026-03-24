import { z } from 'zod'
import { scrapeAgents } from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { requireScrapeAgent } from '#server/utils/scrape-agent-auth'
import { SCRAPE_AGENT_HEARTBEAT_RATE_LIMIT } from '#server/utils/scrape-rate-limit'
import { defineWebhookMutation, withValidatedBody } from '#layer/server/utils/mutation'

const bodySchema = z.object({
  id: z.string().min(1).max(128),
  hostname: z.string().max(256).optional(),
  version: z.string().max(64).optional(),
})

export default defineWebhookMutation(
  {
    rateLimit: SCRAPE_AGENT_HEARTBEAT_RATE_LIMIT,
    parseBody: withValidatedBody((b) => bodySchema.parse(b)),
  },
  async ({ event, body }) => {
    requireScrapeAgent(event)

    const db = useAppDatabase(event)
    const now = new Date().toISOString()

    await db
      .insert(scrapeAgents)
      .values({
        id: body.id,
        hostname: body.hostname ?? null,
        clientVersion: body.version ?? null,
        lastSeenAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: scrapeAgents.id,
        set: {
          lastSeenAt: now,
          hostname: body.hostname ?? null,
          clientVersion: body.version ?? null,
        },
      })

    return { ok: true as const }
  },
)
