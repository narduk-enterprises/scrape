import { texasStageBatchBodySchema } from '@narduk-enterprises/scrape-contract'
import {
  stgAnnualCashReportRaw,
  stgComptrollerObjectsRaw,
  stgExpenditureCategoriesRaw,
  stgExpendituresByCountyRaw,
  stgPaymentsToPayeeRaw,
  stgVendorMasterRaw,
  texasIngestionLogs,
} from '#server/database/app-schema'
import { useAppDatabase } from '#server/utils/app-database'
import { requireScrapeAgent } from '#server/utils/scrape-agent-auth'
import { SCRAPE_AGENT_TEXAS_STAGE_RATE_LIMIT } from '#server/utils/scrape-rate-limit'
import { defineWebhookMutation, withValidatedBody } from '#layer/server/utils/mutation'

function pickStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function pickNum(row: Record<string, unknown>, key: string): number | null {
  const v = row[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replaceAll(',', ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function pickBool(row: Record<string, unknown>, key: string): boolean | null {
  const v = row[key]
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'Y' || v === 'y') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'N' || v === 'n') return false
  return null
}

function pickInt(row: Record<string, unknown>, key: string): number | null {
  const n = pickNum(row, key)
  if (n === null) return null
  const i = Math.trunc(n)
  return i === n ? i : null
}

function rowNumber(row: Record<string, unknown>): number | null {
  const v = row.row_number
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) {
    const n = Number(v)
    return n > 0 ? n : null
  }
  return null
}

function rawJson(row: Record<string, unknown>): string | null {
  const r = row.raw_json
  if (typeof r === 'string' && r.length > 0) return r
  return null
}

function normalizeCountyName(name: string | null): string | null {
  if (!name) return null
  return name.replaceAll(/\s+/g, ' ').trim().toUpperCase()
}

/** D1 allows at most ~100 bound parameters per SQL statement. */
const D1_INSERT_ROW_CHUNK = 5

export default defineWebhookMutation(
  {
    rateLimit: SCRAPE_AGENT_TEXAS_STAGE_RATE_LIMIT,
    parseBody: withValidatedBody((b) => texasStageBatchBodySchema.parse(b)),
  },
  async ({ event, body }) => {
    requireScrapeAgent(event)
    const db = useAppDatabase(event)
    const loadedAt = body.sourceLoadedAt ?? new Date().toISOString()
    const t0 = Date.now()
    const logId = crypto.randomUUID()

    let inserted = 0
    let failed = 0

    try {
      switch (body.dataset) {
        case 'payments_to_payee': {
          const values = []
          for (const row of body.rows) {
            const rn = rowNumber(row)
            const rj = rawJson(row)
            if (rn === null || rj === null) {
              failed += 1
              continue
            }
            const isConf = pickBool(row, 'is_confidential')
            const agency = pickStr(row, 'agency_name')
            const amtNum = pickNum(row, 'amount_numeric')
            const payDateIso = pickStr(row, 'payment_date_iso')
            if (!isConf) {
              if (!agency) {
                failed += 1
                continue
              }
              if (amtNum === null || amtNum <= 0) {
                failed += 1
                continue
              }
              if (!payDateIso || Number.isNaN(Date.parse(payDateIso))) {
                failed += 1
                continue
              }
            } else if (payDateIso && Number.isNaN(Date.parse(payDateIso))) {
              failed += 1
              continue
            }
            values.push({
              id: crypto.randomUUID(),
              agencyName: agency,
              payeeName: pickStr(row, 'payee_name'),
              paymentDate: pickStr(row, 'payment_date'),
              paymentDateIso: payDateIso,
              amount: pickStr(row, 'amount'),
              amountNumeric: amtNum,
              objectCategory: pickStr(row, 'object_category'),
              comptrollerObject: pickStr(row, 'comptroller_object'),
              appropriationNumber: pickStr(row, 'appropriation_number'),
              appropriationYear: pickStr(row, 'appropriation_year'),
              fund: pickStr(row, 'fund'),
              isConfidential: isConf ?? undefined,
              rawJson: rj,
              sourceFileName: body.sourceFileName,
              sourceUrl: body.sourceUrl,
              sourceLoadedAt: loadedAt,
              sourceSnapshotDate: body.sourceSnapshotDate,
              rowNumber: rn,
            })
          }
          if (values.length > 0) {
            for (let i = 0; i < values.length; i += D1_INSERT_ROW_CHUNK) {
              await db
                .insert(stgPaymentsToPayeeRaw)
                .values(values.slice(i, i + D1_INSERT_ROW_CHUNK))
            }
            inserted = values.length
          }
          break
        }
        case 'expenditures_by_county': {
          const values = []
          for (const row of body.rows) {
            const rn = rowNumber(row)
            const rj = rawJson(row)
            if (rn === null || rj === null) {
              failed += 1
              continue
            }
            const fy = pickInt(row, 'fiscal_year')
            const county = pickStr(row, 'county_name')
            const amtNum = pickNum(row, 'amount_numeric')
            if (fy === null || fy < 1990 || fy > 2100) {
              failed += 1
              continue
            }
            if (!county) {
              failed += 1
              continue
            }
            if (amtNum === null) {
              failed += 1
              continue
            }
            values.push({
              id: crypto.randomUUID(),
              fiscalYear: fy,
              countyName: county,
              countyNameNormalized: normalizeCountyName(county),
              agencyName: pickStr(row, 'agency_name'),
              agencyNumber: pickStr(row, 'agency_number'),
              expenditureType: pickStr(row, 'expenditure_type'),
              amount: pickStr(row, 'amount'),
              amountNumeric: amtNum,
              rawJson: rj,
              sourceFileName: body.sourceFileName,
              sourceUrl: body.sourceUrl,
              sourceLoadedAt: loadedAt,
              sourceSnapshotDate: body.sourceSnapshotDate,
              rowNumber: rn,
            })
          }
          if (values.length > 0) {
            for (let i = 0; i < values.length; i += D1_INSERT_ROW_CHUNK) {
              await db
                .insert(stgExpendituresByCountyRaw)
                .values(values.slice(i, i + D1_INSERT_ROW_CHUNK))
            }
            inserted = values.length
          }
          break
        }
        case 'comptroller_objects': {
          const values = []
          for (const row of body.rows) {
            const rn = rowNumber(row)
            const rj = rawJson(row)
            if (rn === null || rj === null) {
              failed += 1
              continue
            }
            const code = pickStr(row, 'object_code')
            if (!code) {
              failed += 1
              continue
            }
            values.push({
              id: crypto.randomUUID(),
              objectCode: code,
              title: pickStr(row, 'title'),
              objectGroup: pickStr(row, 'object_group'),
              rawJson: rj,
              sourceFileName: body.sourceFileName,
              sourceUrl: body.sourceUrl,
              sourceLoadedAt: loadedAt,
              sourceSnapshotDate: body.sourceSnapshotDate,
              rowNumber: rn,
            })
          }
          if (values.length > 0) {
            for (let i = 0; i < values.length; i += D1_INSERT_ROW_CHUNK) {
              await db
                .insert(stgComptrollerObjectsRaw)
                .values(values.slice(i, i + D1_INSERT_ROW_CHUNK))
            }
            inserted = values.length
          }
          break
        }
        case 'expenditure_categories': {
          const values = []
          for (const row of body.rows) {
            const rn = rowNumber(row)
            const rj = rawJson(row)
            if (rn === null || rj === null) {
              failed += 1
              continue
            }
            const code = pickStr(row, 'category_code')
            const title = pickStr(row, 'category_title')
            if (!code || !title) {
              failed += 1
              continue
            }
            values.push({
              id: crypto.randomUUID(),
              categoryCode: code,
              categoryTitle: title,
              rawJson: rj,
              sourceFileName: body.sourceFileName,
              sourceUrl: body.sourceUrl,
              sourceLoadedAt: loadedAt,
              sourceSnapshotDate: body.sourceSnapshotDate,
              rowNumber: rn,
            })
          }
          if (values.length > 0) {
            for (let i = 0; i < values.length; i += D1_INSERT_ROW_CHUNK) {
              await db
                .insert(stgExpenditureCategoriesRaw)
                .values(values.slice(i, i + D1_INSERT_ROW_CHUNK))
            }
            inserted = values.length
          }
          break
        }
        case 'vendor_master': {
          const values = []
          for (const row of body.rows) {
            const rn = rowNumber(row)
            const rj = rawJson(row)
            if (rn === null || rj === null) {
              failed += 1
              continue
            }
            const name = pickStr(row, 'web_vendor_name')
            if (!name) {
              failed += 1
              continue
            }
            values.push({
              id: crypto.randomUUID(),
              webVendorName: name,
              webVid: pickStr(row, 'web_vid'),
              webVendorNo: pickStr(row, 'web_vendor_no'),
              webCity: pickStr(row, 'web_city'),
              webCounty: pickStr(row, 'web_county'),
              webState: pickStr(row, 'web_state'),
              webZip: pickStr(row, 'web_zip'),
              webHubStatus: pickStr(row, 'web_hub_status'),
              webSmallBusFlag: pickStr(row, 'web_small_bus_flag'),
              webDesc: pickStr(row, 'web_desc'),
              rawJson: rj,
              sourceFileName: body.sourceFileName,
              sourceUrl: body.sourceUrl,
              sourceLoadedAt: loadedAt,
              sourceSnapshotDate: body.sourceSnapshotDate,
              rowNumber: rn,
            })
          }
          if (values.length > 0) {
            for (let i = 0; i < values.length; i += D1_INSERT_ROW_CHUNK) {
              await db
                .insert(stgVendorMasterRaw)
                .values(values.slice(i, i + D1_INSERT_ROW_CHUNK))
            }
            inserted = values.length
          }
          break
        }
        case 'annual_cash_report': {
          const values = []
          for (const row of body.rows) {
            const rn = rowNumber(row)
            const rj = rawJson(row)
            if (rn === null || rj === null) {
              failed += 1
              continue
            }
            const fy = pickInt(row, 'report_fiscal_year')
            if (fy === null || fy < 1990 || fy > 2100) {
              failed += 1
              continue
            }
            values.push({
              id: crypto.randomUUID(),
              reportFiscalYear: fy,
              sheetName: pickStr(row, 'sheet_name'),
              fundNumber: pickStr(row, 'fund_number'),
              lineLabel: pickStr(row, 'line_label'),
              amountRaw: pickStr(row, 'amount_raw'),
              amountNumeric: pickNum(row, 'amount_numeric'),
              rawJson: rj,
              sourceFileName: body.sourceFileName,
              sourceUrl: body.sourceUrl,
              sourceLoadedAt: loadedAt,
              sourceSnapshotDate: body.sourceSnapshotDate,
              rowNumber: rn,
            })
          }
          if (values.length > 0) {
            for (let i = 0; i < values.length; i += D1_INSERT_ROW_CHUNK) {
              await db
                .insert(stgAnnualCashReportRaw)
                .values(values.slice(i, i + D1_INSERT_ROW_CHUNK))
            }
            inserted = values.length
          }
          break
        }
      }

      const durationMs = Date.now() - t0
      const status = failed > 0 && inserted === 0 ? 'failed' : failed > 0 ? 'partial' : 'ok'

      await db.insert(texasIngestionLogs).values({
        id: logId,
        dataset: body.dataset,
        sourceUrl: body.sourceUrl,
        sourceFileName: body.sourceFileName,
        rowCount: inserted,
        rowsFailed: failed,
        checksumSha256: body.fileChecksumSha256 ?? null,
        loadedAt,
        durationMs,
        status,
        errorMessage: null,
      })

      return {
        logId,
        inserted,
        failed,
        durationMs,
        status,
      }
    } catch (err) {
      const durationMs = Date.now() - t0
      const message = err instanceof Error ? err.message : String(err)
      try {
        await db.insert(texasIngestionLogs).values({
          id: logId,
          dataset: body.dataset,
          sourceUrl: body.sourceUrl,
          sourceFileName: body.sourceFileName,
          rowCount: 0,
          rowsFailed: body.rows.length,
          checksumSha256: body.fileChecksumSha256 ?? null,
          loadedAt,
          durationMs,
          status: 'error',
          errorMessage: message.slice(0, 4000),
        })
      } catch {
        // best-effort log
      }
      throw err
    }
  },
)
