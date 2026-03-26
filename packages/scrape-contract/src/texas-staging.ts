import { z } from 'zod'

/** Matches physical staging table names (snake without stg_ prefix for API ergonomics). */
export const texasStagingDatasetSchema = z.enum([
  'payments_to_payee',
  'expenditures_by_county',
  'comptroller_objects',
  'expenditure_categories',
  'vendor_master',
  'annual_cash_report',
])

export const texasStageBatchBodySchema = z.object({
  dataset: texasStagingDatasetSchema,
  sourceFileName: z.string().min(1).max(512),
  sourceUrl: z.string().min(1).max(8192),
  /** YYYY-MM-DD — logical snapshot date for the extract */
  sourceSnapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO timestamp; defaults server-side if omitted */
  sourceLoadedAt: z.string().min(10).max(40).optional(),
  fileChecksumSha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/)
    .optional(),
  /**
   * Each element: column map including required `row_number` (1-based) and `raw_json` (stringified object).
   * Other keys are dataset-specific and mapped in the API handler.
   */
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
})

export type TexasStagingDataset = z.infer<typeof texasStagingDatasetSchema>
export type TexasStageBatchBody = z.infer<typeof texasStageBatchBodySchema>
