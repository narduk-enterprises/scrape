/**
 * Headless CSV export fallback for State Revenue & Expenditure (payments).
 * Configure selectors after inspecting network/UI:
 *   TEXAS_SPENDING_PAGE_URL
 *   TEXAS_SPENDING_FY_SELECTOR (optional <select> for fiscal year)
 *   TEXAS_SPENDING_DOWNLOAD_TRIGGER_SELECTOR
 */
export declare function downloadPaymentsCsvPlaywright(fiscalYear: number, timeoutMs: number): Promise<{
    csvText: string;
    url: string;
    fileName: string;
}>;
