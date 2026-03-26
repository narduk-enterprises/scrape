/** Parse currency-like strings to a finite number, or null. */
export declare function parseAmount(raw: string | null | undefined): number | null;
/** Best-effort date → ISO calendar date (UTC midnight). */
export declare function parseToIsoDate(raw: string | null | undefined): string | null;
