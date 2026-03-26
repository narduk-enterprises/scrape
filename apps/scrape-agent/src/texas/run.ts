import type { ApiClient } from '../api-client.js'
import { parseCsvRows, rowsToObjects } from './csv.js'
import { pickField } from './fields.js'
import { sha256Hex } from './hash.js'
import { ingestTexasRows } from './ingest.js'
import { parseAmount, parseToIsoDate } from './money-date.js'
import { downloadPaymentsCsvPlaywright } from './playwright-payments.js'
import {
  CASH_REPORT_ZIP_TMPL,
  SOCRATA_EXPENDITURE_CATEGORIES,
  SOCRATA_OBJECT_CODES,
  VENDOR_MASTER_CSV_URL,
  cashReportFiscalYears,
  countyResourceList,
  paymentsFiscalYears,
} from './sources.js'

const ALL = new Set([
  'payments',
  'county',
  'objects',
  'categories',
  'vendor',
  'cash',
])

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function fetchText(url: string, timeoutMs = 180_000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'scrape-agent-texas/1.0' },
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

async function retry<T>(label: string, attempts: number, fn: () => Promise<T>): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      const wait = 1500 * (i + 1)
      log(`${label} attempt ${i + 1}/${attempts} failed — retry in ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw last
}

function mapCountyRow(o: Record<string, string>, rowNumber: number): Record<string, unknown> {
  const fy = Number(pickField(o, 'fiscal_year', 'fiscalyear', 'fy'))
  const county = pickField(o, 'county', 'county_name')
  const agency = pickField(o, 'agency_name', 'agency')
  const agencyNum = pickField(o, 'agency_number', 'agency_no', 'agencynumber')
  const expType = pickField(
    o,
    'major_spending_category',
    'expenditure_category',
    'expenditure_type',
  )
  const amtRaw = pickField(o, 'amount', 'net_expenditure', 'dollar_amount')
  return {
    row_number: rowNumber,
    fiscal_year: fy,
    county_name: county,
    agency_name: agency || null,
    agency_number: agencyNum || null,
    expenditure_type: expType || null,
    amount: amtRaw || null,
    amount_numeric: parseAmount(amtRaw),
    raw_json: JSON.stringify(o),
  }
}

function mapPaymentRow(o: Record<string, string>, rowNumber: number): Record<string, unknown> {
  const agency = pickField(o, 'agency_name', 'agency', 'paying_agency')
  const payee = pickField(o, 'payee_name', 'payee', 'vendor_name', 'vendor')
  const payDate = pickField(o, 'payment_date', 'check_date', 'paid_date')
  const iso = parseToIsoDate(payDate)
  const amtRaw = pickField(o, 'amount', 'payment_amount', 'dollar_amount')
  const amt = parseAmount(amtRaw)
  const conf = /confidential/i.test(payee) || /confidential/i.test(amtRaw)
  return {
    row_number: rowNumber,
    agency_name: agency || null,
    payee_name: payee || null,
    payment_date: payDate || null,
    payment_date_iso: iso,
    amount: amtRaw || null,
    amount_numeric: amt,
    object_category: pickField(o, 'object_category', 'expenditure_category') || null,
    comptroller_object: pickField(o, 'comptroller_object', 'object', 'object_code') || null,
    appropriation_number: pickField(o, 'appropriation_number', 'appropriation_no') || null,
    appropriation_year: pickField(o, 'appropriation_year') || null,
    fund: pickField(o, 'fund') || null,
    is_confidential: conf,
    raw_json: JSON.stringify(o),
  }
}

function mapObjectRow(o: Record<string, string>, rowNumber: number): Record<string, unknown> {
  const code = pickField(o, 'object', 'object_number', 'object_code', 'comptroller_object')
  const title = pickField(o, 'object_title', 'title', 'description')
  const grp = pickField(o, 'object_group', 'object_type', 'category')
  return {
    row_number: rowNumber,
    object_code: code,
    title: title || null,
    object_group: grp || null,
    raw_json: JSON.stringify(o),
  }
}

function mapCategoryRow(o: Record<string, string>, rowNumber: number): Record<string, unknown> {
  const code = pickField(o, 'expenditure_category', 'category_code', 'category')
  const title = pickField(o, 'title', 'category_title', 'description')
  return {
    row_number: rowNumber,
    category_code: code,
    category_title: title,
    raw_json: JSON.stringify(o),
  }
}

function mapVendorRow(o: Record<string, string>, rowNumber: number): Record<string, unknown> {
  return {
    row_number: rowNumber,
    web_vendor_name: pickField(o, 'web_vendor_name', 'vendor_name', 'name') || null,
    web_vid: pickField(o, 'web_vid', 'vid') || null,
    web_vendor_no: pickField(o, 'web_vendor_no', 'vendor_no') || null,
    web_city: pickField(o, 'web_city', 'city') || null,
    web_county: pickField(o, 'web_county', 'county') || null,
    web_state: pickField(o, 'web_state', 'state') || null,
    web_zip: pickField(o, 'web_zip', 'zip') || null,
    web_hub_status: pickField(o, 'web_hub_status', 'hub_status') || null,
    web_small_bus_flag: pickField(o, 'web_small_bus_flag', 'small_business') || null,
    web_desc: pickField(o, 'web_desc', 'description') || null,
    raw_json: JSON.stringify(o),
  }
}

async function tryDirectPaymentsCsv(fiscalYear: number): Promise<{
  csvText: string
  url: string
  fileName: string
} | null> {
  const tmpl = process.env.TEXAS_PAYMENTS_CSV_URL
  if (!tmpl) return null
  const url = tmpl.replaceAll('{fy}', String(fiscalYear))
  try {
    const text = await fetchText(url, 120_000)
    if (text.length < 30) return null
    return { csvText: text, url, fileName: `payments_${fiscalYear}.csv` }
  } catch {
    return null
  }
}

export async function runTexasPipeline(
  api: ApiClient,
  selection: Set<string>,
  snapshotDate: string,
): Promise<void> {
  const dry = process.env.TEXAS_DRY_RUN === '1'
  const want = (k: string) => selection.has('all') || selection.has(k)

  if (want('county')) {
    for (const { fiscalYear, resourceId } of countyResourceList()) {
      const url = `https://data.texas.gov/resource/${resourceId}.csv?$limit=500000`
      const label = `county FY${fiscalYear}`
      await retry(label, 3, async () => {
        const text = await fetchText(url)
        const checksum = sha256Hex(text)
        if (text.trim().length < 50) throw new Error('empty county CSV')
        const { headers, rows } = parseCsvRows(text)
        const objs = rowsToObjects(headers, rows)
        const staging = objs.map((o, i) => mapCountyRow(o, i + 1))
        log(`${label}: ${staging.length} row(s), sha256=${checksum.slice(0, 12)}…`)
        if (!dry) {
          await ingestTexasRows(api, 'expenditures_by_county', {
            sourceFileName: `expenditures_by_county_${fiscalYear}.csv`,
            sourceUrl: url,
            sourceSnapshotDate: snapshotDate,
            fileChecksumSha256: checksum,
          }, staging)
        }
      })
    }
  }

  if (want('objects')) {
    const url = `https://data.texas.gov/resource/${SOCRATA_OBJECT_CODES}.csv?$limit=200000`
    await retry('object_codes', 3, async () => {
      const text = await fetchText(url)
      const checksum = sha256Hex(text)
      const { headers, rows } = parseCsvRows(text)
      const objs = rowsToObjects(headers, rows)
      const staging = objs.map((o, i) => mapObjectRow(o, i + 1))
      log(`object_codes: ${staging.length} row(s)`)
      if (!dry) {
        await ingestTexasRows(api, 'comptroller_objects', {
          sourceFileName: 'comptroller_objects.csv',
          sourceUrl: url,
          sourceSnapshotDate: snapshotDate,
          fileChecksumSha256: checksum,
        }, staging)
      }
    })
  }

  if (want('categories')) {
    const url = `https://data.texas.gov/resource/${SOCRATA_EXPENDITURE_CATEGORIES}.csv?$limit=10000`
    await retry('expenditure_categories', 3, async () => {
      const text = await fetchText(url)
      const checksum = sha256Hex(text)
      const { headers, rows } = parseCsvRows(text)
      const objs = rowsToObjects(headers, rows)
      const staging = objs.map((o, i) => mapCategoryRow(o, i + 1))
      log(`expenditure_categories: ${staging.length} row(s)`)
      if (!dry) {
        await ingestTexasRows(api, 'expenditure_categories', {
          sourceFileName: 'expenditure_categories.csv',
          sourceUrl: url,
          sourceSnapshotDate: snapshotDate,
          fileChecksumSha256: checksum,
        }, staging)
      }
    })
  }

  if (want('vendor')) {
    const url = VENDOR_MASTER_CSV_URL
    await retry('vendor_master', 3, async () => {
      const text = await fetchText(url, 300_000)
      const checksum = sha256Hex(text)
      const { headers, rows } = parseCsvRows(text)
      const objs = rowsToObjects(headers, rows)
      const staging = objs.map((o, i) => mapVendorRow(o, i + 1))
      log(`vendor_master: ${staging.length} row(s)`)
      if (!dry) {
        await ingestTexasRows(api, 'vendor_master', {
          sourceFileName: 'web_name.csv',
          sourceUrl: url,
          sourceSnapshotDate: snapshotDate,
          fileChecksumSha256: checksum,
        }, staging)
      }
    })
  }

  if (want('cash')) {
    const yearsBack = Number(process.env.TEXAS_CASH_YEARS_BACK ?? '5')
    const XLSX = await import('xlsx')
    const { default: StreamZip } = await import('node-stream-zip')
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')

    for (const fy of cashReportFiscalYears(yearsBack)) {
      const zipUrl = CASH_REPORT_ZIP_TMPL.replace('{fy}', String(fy))
      const label = `cash_report FY${fy}`
      await retry(label, 3, async () => {
        const buf = Buffer.from(await (await fetch(zipUrl, { signal: AbortSignal.timeout(300_000) })).arrayBuffer())
        const checksum = sha256Hex(buf)
        if (buf.length < 500) throw new Error(`zip too small (${buf.length} bytes)`)
        const dir = await mkdtemp(join(tmpdir(), 'tx-cash-'))
        const zipPath = join(dir, 'data.zip')
        await writeFile(zipPath, buf)
        const zip = new StreamZip.async({ file: zipPath })
        const entries = await zip.entries()
        const allRows: Record<string, unknown>[] = []
        let rn = 0
        for (const name of Object.keys(entries)) {
          if (!/\.xlsx$/i.test(name) && !/\.xls$/i.test(name)) continue
          const data = await zip.entryData(name)
          const wb = XLSX.read(data, { type: 'buffer', cellDates: true })
          for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName]
            if (!sheet) continue
            const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
              header: 1,
              defval: '',
              raw: false,
            }) as unknown[][]
            for (let r = 0; r < matrix.length; r++) {
              const cells = matrix[r] as unknown[]
              if (!cells?.length) continue
              const raw = cells.map((c) => (c === undefined || c === null ? '' : String(c)))
              if (raw.every((c) => !c.trim())) continue
              rn++
              const labelCol = raw[0]?.trim() ?? ''
              let amountNum: number | null = null
              let amountRaw: string | null = null
              for (let i = raw.length - 1; i >= 0; i--) {
                const n = parseAmount(raw[i]!)
                if (n !== null) {
                  amountNum = n
                  amountRaw = raw[i]!
                  break
                }
              }
              allRows.push({
                row_number: rn,
                report_fiscal_year: fy,
                sheet_name: sheetName,
                fund_number: null,
                line_label: labelCol || null,
                amount_raw: amountRaw,
                amount_numeric: amountNum,
                raw_json: JSON.stringify({ zipEntry: name, sheetRow: r + 1, cells: raw }),
              })
            }
          }
        }
        await zip.close()
        await rm(dir, { recursive: true, force: true })
        if (allRows.length === 0) throw new Error('no spreadsheet rows extracted')
        log(`${label}: ${allRows.length} row(s)`)
        if (!dry) {
          await ingestTexasRows(api, 'annual_cash_report', {
            sourceFileName: `cash_report_${fy}.zip`,
            sourceUrl: zipUrl,
            sourceSnapshotDate: snapshotDate,
            fileChecksumSha256: checksum,
          }, allRows)
        }
      }).catch((e) => {
        log(`${label} skipped: ${e instanceof Error ? e.message : String(e)}`)
      })
    }
  }

  if (want('payments')) {
    const skipPw = process.env.TEXAS_PAYMENTS_PLAYWRIGHT === '0'
    for (const fy of paymentsFiscalYears(Number(process.env.TEXAS_PAYMENTS_YEARS_BACK ?? '10'))) {
      const label = `payments FY${fy}`
      await retry(label, 3, async () => {
        const direct = await tryDirectPaymentsCsv(fy)
        let csvText: string
        let url: string
        let fileName: string
        if (direct) {
          ;({ csvText, url, fileName } = direct)
        } else if (!skipPw) {
          const pw = await downloadPaymentsCsvPlaywright(fy, 120_000)
          csvText = pw.csvText
          url = pw.url
          fileName = pw.fileName
        } else {
          throw new Error(
            'Set TEXAS_PAYMENTS_CSV_URL with {fy} or enable Playwright (unset TEXAS_PAYMENTS_PLAYWRIGHT=0)',
          )
        }
        const checksum = sha256Hex(csvText)
        const { headers, rows } = parseCsvRows(csvText)
        if (rows.length === 0) throw new Error('payments CSV has zero data rows')
        const objs = rowsToObjects(headers, rows)
        const staging = objs.map((o, i) => mapPaymentRow(o, i + 1))
        log(`${label}: ${staging.length} row(s)`)
        if (!dry) {
          await ingestTexasRows(api, 'payments_to_payee', {
            sourceFileName: fileName,
            sourceUrl: url,
            sourceSnapshotDate: snapshotDate,
            fileChecksumSha256: checksum,
          }, staging)
        }
      }).catch((e) => {
        log(`${label} failed after retries: ${e instanceof Error ? e.message : String(e)}`)
      })
    }
  }
}

export function parseTexasSelection(argv: string[]): Set<string> {
  if (argv.length === 0) return new Set(['all'])
  const s = new Set<string>()
  for (const a of argv) {
    const k = a.toLowerCase().trim()
    if (k === 'all') return new Set(['all'])
    if (ALL.has(k)) s.add(k)
    else log(`unknown dataset "${a}" — ignored (expected: ${[...ALL].join(', ')}, all)`)
  }
  return s.size > 0 ? s : new Set(['all'])
}
