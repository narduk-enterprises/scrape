/**
 * Work-queue scraper entrypoint.
 *
 * - Default: `basic-html` — see `basic-html-scrape.ts`.
 * - Bulk Texas Comptroller / Open Data loads (CSV, ZIP/XLSX, optional Playwright)
 *   run via CLI: `pnpm --filter scrape-agent exec tsx src/cli.ts texas run …`
 *   and POST batches to `/api/scrape/agent/texas-stage`.
 */
import type { WorkItem } from './api-client.js'
import { scrapeBasicHtmlWorkItem } from './basic-html-scrape.js'
import type { ScrapeOutcome } from './scraper-types.js'

export type {
  ObservationPayload,
  ScrapeFailure,
  ScrapeOutcome,
  ScrapeSuccess,
} from './scraper-types.js'

export async function scrapeWorkItem(item: WorkItem): Promise<ScrapeOutcome> {
  const strategy =
    item.meta && typeof item.meta.strategy === 'string' ? item.meta.strategy : 'basic-html'

  if (strategy !== 'basic-html') {
    return {
      ok: false,
      item,
      error: `Unknown scrape strategy "${strategy}". Texas bulk ingest uses the "texas run" CLI, not the work queue.`,
    }
  }

  return scrapeBasicHtmlWorkItem(item)
}
