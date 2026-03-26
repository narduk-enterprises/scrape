import type { TexasStagingDataset } from '@narduk-enterprises/scrape-contract';
import type { ApiClient } from '../api-client.js';
export declare function ingestTexasRows(api: ApiClient, dataset: TexasStagingDataset, ctx: {
    sourceFileName: string;
    sourceUrl: string;
    sourceSnapshotDate: string;
    fileChecksumSha256?: string;
}, rows: Record<string, unknown>[]): Promise<{
    batches: number;
    inserted: number;
}>;
