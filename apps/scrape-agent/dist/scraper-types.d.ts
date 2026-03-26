import type { WorkItem } from './api-client.js';
export interface ObservationPayload {
    sourceKey: string;
    fingerprint: string;
    normalizedUrl: string;
    externalKey?: string;
    label?: string;
    targetMeta?: Record<string, unknown>;
    contentHash: string;
    payload: Record<string, unknown>;
    qualityScore: number;
    strategy: string;
    observedAt: string;
}
export interface ScrapeSuccess {
    ok: true;
    item: WorkItem;
    observation: ObservationPayload;
}
export interface ScrapeFailure {
    ok: false;
    item: WorkItem;
    error: string;
}
export type ScrapeOutcome = ScrapeSuccess | ScrapeFailure;
