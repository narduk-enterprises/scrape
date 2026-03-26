/**
 * Default Open Data resource IDs (4x4) — extend via TEXAS_COUNTY_RESOURCES_JSON.
 * @see https://data.texas.gov (search "Expenditures by County")
 */
export declare const DEFAULT_COUNTY_RESOURCES: {
    fiscalYear: number;
    resourceId: string;
}[];
export declare const SOCRATA_OBJECT_CODES = "gern-2bvs";
export declare const SOCRATA_EXPENDITURE_CATEGORIES = "d57d-zxw6";
export declare const VENDOR_MASTER_CSV_URL: string;
export declare const CASH_REPORT_ZIP_TMPL: string;
export declare function countyResourceList(): {
    fiscalYear: number;
    resourceId: string;
}[];
export declare function currentTexasFiscalYear(now?: Date): number;
export declare function paymentsFiscalYears(back?: number): number[];
export declare function cashReportFiscalYears(back?: number): number[];
