import type { WorkItem } from './api-client.js';
import type { ScrapeOutcome } from './scraper-types.js';
export declare function scrapeBasicHtmlWorkItem(item: WorkItem): Promise<ScrapeOutcome>;
