/** Minimal RFC4180-style CSV parse (quoted fields, commas). */
export declare function parseCsvRows(text: string): {
    headers: string[];
    rows: string[][];
};
export declare function normalizeHeaderKey(h: string): string;
export declare function rowsToObjects(headers: string[], rows: string[][]): Record<string, string>[];
