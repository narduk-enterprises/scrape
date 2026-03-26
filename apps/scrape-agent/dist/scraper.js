import { scrapeBasicHtmlWorkItem } from './basic-html-scrape.js';
export async function scrapeWorkItem(item) {
    const strategy = item.meta && typeof item.meta.strategy === 'string' ? item.meta.strategy : 'basic-html';
    if (strategy !== 'basic-html') {
        return {
            ok: false,
            item,
            error: `Unknown scrape strategy "${strategy}". Texas bulk ingest uses the "texas run" CLI, not the work queue.`,
        };
    }
    return scrapeBasicHtmlWorkItem(item);
}
