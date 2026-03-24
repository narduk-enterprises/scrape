/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from '../database/schema'

/**
 * Return a Drizzle ORM instance for the current request.
 *
 * Creates a lightweight per-request wrapper from the Cloudflare D1 binding.
 * Memoized on `event.context` to avoid redundant instantiation within a single
 * request lifecycle. This avoids module-scope singletons which risk stale
 * bindings across isolate reuse on Cloudflare Workers.
 */
export function useDatabase(event: H3Event): DrizzleD1Database<typeof schema> {
  if (event.context._db) {
    return event.context._db
  }

  const d1 = (event.context.cloudflare?.env as { DB?: D1Database })?.DB
  if (!d1) {
    throw createError({
      statusCode: 500,
      message: 'D1 database binding not available. Ensure DB is configured in wrangler.json.',
    })
  }

  const db = drizzle(d1, { schema })
  event.context._db = db
  return db
}

/**
 * Factory to create an app-level Drizzle accessor with typed schema.
 *
 * The layer's `useDatabase()` only knows about the base layer tables.
 * Apps that add their own tables need a typed wrapper. Instead of each app
 * copy-pasting identical boilerplate, use this factory:
 *
 * @example
 * ```ts
 * // apps/web/server/utils/database.ts
 * import * as schema from '../database/schema'
 * export const useAppDatabase = createAppDatabase(schema)
 * ```
 *
 * The returned function is memoized on `event.context._appDb` (separate from
 * the layer's `_db` key) so multiple calls within a single request are free.
 */
export function createAppDatabase<T extends Record<string, unknown>>(appSchema: T) {
  return (event: H3Event): DrizzleD1Database<T> => {
    if (event.context._appDb) {
      return event.context._appDb as DrizzleD1Database<T>
    }

    const d1 = (event.context.cloudflare?.env as { DB?: D1Database })?.DB
    if (!d1) {
      throw createError({
        statusCode: 500,
        message: 'D1 database binding not available. Ensure DB is configured in wrangler.json.',
      })
    }

    const db = drizzle(d1, { schema: appSchema })
    event.context._appDb = db
    return db
  }
}
