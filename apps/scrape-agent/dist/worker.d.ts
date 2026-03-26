import { type ScrapeOutcome } from './scraper.js';
export interface WorkerConfig {
    pollIntervalMs: number;
    maxPollIntervalMs: number;
    concurrency: number;
    batchSize: number;
    heartbeatIntervalMs: number;
}
export declare function configFromEnv(overrides?: Partial<WorkerConfig>): WorkerConfig;
export interface WorkerCycleResult {
    deduped: number;
    failures: number;
    inserted: number;
    outcomes: ScrapeOutcome[];
    runId: string | null;
    workItemCount: number;
}
export declare function startWorker(config?: WorkerConfig): Promise<void>;
export declare function runWorkerOnce(config?: Partial<WorkerConfig>): Promise<WorkerCycleResult | null>;
