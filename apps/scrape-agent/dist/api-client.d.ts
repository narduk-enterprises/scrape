import { type IngestBody, type TexasStageBatchBody } from '@narduk-enterprises/scrape-contract';
export interface WorkItem {
    targetId: string;
    fingerprint: string;
    normalizedUrl: string;
    externalKey?: string;
    label?: string;
    meta?: Record<string, unknown>;
    sourceKey: string;
    defaultTtlSeconds: number;
}
export interface IngestResult {
    runId: string;
    observationsInserted: number;
    observationsDeduped: number;
}
export interface TexasStageResult {
    logId: string;
    inserted: number;
    failed: number;
    durationMs: number;
    status: string;
}
export declare class ApiClient {
    readonly baseUrl: string;
    readonly agentId: string;
    readonly agentHostname: string;
    readonly version = "0.1.0";
    private readonly secret;
    constructor(opts?: {
        baseUrl?: string;
        secret?: string;
        agentId?: string;
        allowPlaceholderSecret?: boolean;
    });
    private headers;
    heartbeat(): Promise<void>;
    fetchWork(limit: number): Promise<WorkItem[]>;
    ingest(body: IngestBody): Promise<IngestResult>;
    ingestTexasStage(body: TexasStageBatchBody): Promise<TexasStageResult>;
}
