/**
 * Work-queue scraper entrypoint.
 *
 * - Default: `basic-html` — see `basic-html-scrape.ts`.
 * - Bulk Texas Comptroller / Open Data loads (CSV, ZIP/XLSX, optional Playwright)
 *   run via CLI: `pnpm --filter scrape-agent exec tsx src/cli.ts texas run …`
 *   and POST batches to `/api/scrape/agent/texas-stage`.
 */
import type { WorkItem } from './api-client.js';
import type { ScrapeOutcome } from './scraper-types.js';
export type { ObservationPayload, ScrapeFailure, ScrapeOutcome, ScrapeSuccess, } from './scraper-types.js';
export declare function scrapeWorkItem(item: WorkItem): Promise<ScrapeOutcome>;
