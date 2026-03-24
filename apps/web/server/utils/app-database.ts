import { createAppDatabase } from '#layer/server/utils/database'
import * as fullSchema from '#server/database/schema'

/** Drizzle D1 with layer + app (scrape) tables. */
export const useAppDatabase = createAppDatabase(fullSchema)
