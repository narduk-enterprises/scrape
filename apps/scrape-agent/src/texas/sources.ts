/**
 * Default Open Data resource IDs (4x4) — extend via TEXAS_COUNTY_RESOURCES_JSON.
 * @see https://data.texas.gov (search "Expenditures by County")
 */
export const DEFAULT_COUNTY_RESOURCES: { fiscalYear: number; resourceId: string }[] = [
  { fiscalYear: 2023, resourceId: 'iyey-5sid' },
  { fiscalYear: 2020, resourceId: 'aact-g69n' },
  { fiscalYear: 2010, resourceId: 'm8nt-qbcj' },
]

export const SOCRATA_OBJECT_CODES = 'gern-2bvs'
export const SOCRATA_EXPENDITURE_CATEGORIES = 'd57d-zxw6'

export const VENDOR_MASTER_CSV_URL =
  process.env.TEXAS_VENDOR_CSV_URL ?? 'https://comptroller.texas.gov/auto-data/purchasing/web_name.csv'

export const CASH_REPORT_ZIP_TMPL =
  process.env.TEXAS_CASH_REPORT_ZIP_TMPL ??
  'https://comptroller.texas.gov/transparency/reports/cash-report/{fy}/data/data.zip'

export function countyResourceList(): { fiscalYear: number; resourceId: string }[] {
  const raw = process.env.TEXAS_COUNTY_RESOURCES_JSON
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return DEFAULT_COUNTY_RESOURCES
      return parsed
        .map((x) => {
          if (!x || typeof x !== 'object') return null
          const o = x as Record<string, unknown>
          const fiscalYear = Number(o.fiscalYear ?? o.fiscal_year)
          const resourceId = String(o.resourceId ?? o.resource_id ?? '')
          if (!Number.isFinite(fiscalYear) || !resourceId) return null
          return { fiscalYear, resourceId }
        })
        .filter((x): x is { fiscalYear: number; resourceId: string } => x !== null)
    } catch {
      return DEFAULT_COUNTY_RESOURCES
    }
  }
  return DEFAULT_COUNTY_RESOURCES
}

export function currentTexasFiscalYear(now = new Date()): number {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  // Texas FY starts Sep 1 — approximate: Sep–Dec belongs to FY y+1 label in calendar terms varies; use Sep cutoff
  return m >= 9 ? y + 1 : y
}

export function paymentsFiscalYears(back = 10): number[] {
  const start = currentTexasFiscalYear()
  return Array.from({ length: back + 1 }, (_, i) => start - i)
}

export function cashReportFiscalYears(back = 5): number[] {
  const start = currentTexasFiscalYear()
  return Array.from({ length: back + 1 }, (_, i) => start - i)
}
