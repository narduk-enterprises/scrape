/**
 * Texas Comptroller transparency — raw staging tables (append-only loads).
 * Each row includes source provenance per DATA SOURCE IMPLEMENTATION contract.
 */
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const stgPaymentsToPayeeRaw = sqliteTable(
  'stg_payments_to_payee_raw',
  {
    id: text('id').primaryKey(),
    agencyName: text('agency_name'),
    payeeName: text('payee_name'),
    paymentDate: text('payment_date'),
    paymentDateIso: text('payment_date_iso'),
    amount: text('amount'),
    amountNumeric: real('amount_numeric'),
    objectCategory: text('object_category'),
    comptrollerObject: text('comptroller_object'),
    appropriationNumber: text('appropriation_number'),
    appropriationYear: text('appropriation_year'),
    fund: text('fund'),
    isConfidential: integer('is_confidential', { mode: 'boolean' }),
    rawJson: text('raw_json').notNull(),
    sourceFileName: text('source_file_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceLoadedAt: text('source_loaded_at').notNull(),
    sourceSnapshotDate: text('source_snapshot_date').notNull(),
    rowNumber: integer('row_number').notNull(),
  },
  (t) => ({
    snapIdx: index('stg_payments_snap_idx').on(t.sourceSnapshotDate),
  }),
)

export const stgExpendituresByCountyRaw = sqliteTable(
  'stg_expenditures_by_county_raw',
  {
    id: text('id').primaryKey(),
    fiscalYear: integer('fiscal_year'),
    countyName: text('county_name'),
    countyNameNormalized: text('county_name_normalized'),
    agencyName: text('agency_name'),
    agencyNumber: text('agency_number'),
    expenditureType: text('expenditure_type'),
    amount: text('amount'),
    amountNumeric: real('amount_numeric'),
    rawJson: text('raw_json').notNull(),
    sourceFileName: text('source_file_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceLoadedAt: text('source_loaded_at').notNull(),
    sourceSnapshotDate: text('source_snapshot_date').notNull(),
    rowNumber: integer('row_number').notNull(),
  },
  (t) => ({
    fyIdx: index('stg_county_fy_idx').on(t.fiscalYear),
  }),
)

export const stgComptrollerObjectsRaw = sqliteTable('stg_comptroller_objects_raw', {
  id: text('id').primaryKey(),
  objectCode: text('object_code'),
  title: text('title'),
  objectGroup: text('object_group'),
  rawJson: text('raw_json').notNull(),
  sourceFileName: text('source_file_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceLoadedAt: text('source_loaded_at').notNull(),
  sourceSnapshotDate: text('source_snapshot_date').notNull(),
  rowNumber: integer('row_number').notNull(),
})

export const stgExpenditureCategoriesRaw = sqliteTable('stg_expenditure_categories_raw', {
  id: text('id').primaryKey(),
  categoryCode: text('category_code'),
  categoryTitle: text('category_title'),
  rawJson: text('raw_json').notNull(),
  sourceFileName: text('source_file_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceLoadedAt: text('source_loaded_at').notNull(),
  sourceSnapshotDate: text('source_snapshot_date').notNull(),
  rowNumber: integer('row_number').notNull(),
})

export const stgVendorMasterRaw = sqliteTable('stg_vendor_master_raw', {
  id: text('id').primaryKey(),
  webVendorName: text('web_vendor_name'),
  webVid: text('web_vid'),
  webVendorNo: text('web_vendor_no'),
  webCity: text('web_city'),
  webCounty: text('web_county'),
  webState: text('web_state'),
  webZip: text('web_zip'),
  webHubStatus: text('web_hub_status'),
  webSmallBusFlag: text('web_small_bus_flag'),
  webDesc: text('web_desc'),
  rawJson: text('raw_json').notNull(),
  sourceFileName: text('source_file_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceLoadedAt: text('source_loaded_at').notNull(),
  sourceSnapshotDate: text('source_snapshot_date').notNull(),
  rowNumber: integer('row_number').notNull(),
})

export const stgAnnualCashReportRaw = sqliteTable(
  'stg_annual_cash_report_raw',
  {
    id: text('id').primaryKey(),
    reportFiscalYear: integer('report_fiscal_year'),
    sheetName: text('sheet_name'),
    fundNumber: text('fund_number'),
    lineLabel: text('line_label'),
    amountRaw: text('amount_raw'),
    amountNumeric: real('amount_numeric'),
    rawJson: text('raw_json').notNull(),
    sourceFileName: text('source_file_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceLoadedAt: text('source_loaded_at').notNull(),
    sourceSnapshotDate: text('source_snapshot_date').notNull(),
    rowNumber: integer('row_number').notNull(),
  },
  (t) => ({
    fyIdx: index('stg_cash_fy_idx').on(t.reportFiscalYear),
  }),
)

/** Per-batch ingestion audit (append-only). */
export const texasIngestionLogs = sqliteTable(
  'texas_ingestion_logs',
  {
    id: text('id').primaryKey(),
    dataset: text('dataset').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceFileName: text('source_file_name'),
    rowCount: integer('row_count').notNull(),
    rowsFailed: integer('rows_failed').notNull().default(0),
    checksumSha256: text('checksum_sha256'),
    loadedAt: text('loaded_at').notNull(),
    durationMs: integer('duration_ms'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
  },
  (t) => ({
    dsIdx: index('texas_ingestion_logs_dataset_idx').on(t.dataset, t.loadedAt),
  }),
)
