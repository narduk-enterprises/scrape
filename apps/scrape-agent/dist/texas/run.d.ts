import type { ApiClient } from '../api-client.js';
export declare function runTexasPipeline(api: ApiClient, selection: Set<string>, snapshotDate: string): Promise<void>;
export declare function parseTexasSelection(argv: string[]): Set<string>;
