/**
 * URL scraper — fetches a page and extracts structured data.
 *
 * Default strategy: plain HTTP fetch + regex-based HTML extraction.
 * Extracts title, meta description, Open Graph tags, and price patterns.
 * Replace or extend this module for headless-browser or API-based scraping.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { computeContentHash } from '@narduk-enterprises/scrape-contract'
import type { WorkItem } from './api-client.js'

export interface ObservationPayload {
  sourceKey: string
  fingerprint: string
  normalizedUrl: string
  externalKey?: string
  label?: string
  targetMeta?: Record<string, unknown>
  contentHash: string
  payload: Record<string, unknown>
  qualityScore: number
  strategy: string
  observedAt: string
}

export interface ScrapeSuccess {
  ok: true
  item: WorkItem
  observation: ObservationPayload
}

export interface ScrapeFailure {
  ok: false
  item: WorkItem
  error: string
}

export type ScrapeOutcome = ScrapeSuccess | ScrapeFailure

const FETCH_TIMEOUT_MS = 30_000
const USER_AGENT = 'ScrapeAgent/0.1.0'
const CURL_META_MARKER = '__SCRAPE_AGENT_META__'
const SOFT_ERROR_PATTERNS = [
  /whoops,\s*we couldn't find that/i,
  /sorry,\s*we'?re unable to complete your request/i,
  /pardon our interruption/i,
  /just a moment/i,
  /error ref:/i,
  /access denied/i,
  /account\/login/i,
  /\/login\b/i,
  /verify you are a human/i,
  /request blocked/i,
  /captcha/i,
]

export async function scrapeWorkItem(item: WorkItem): Promise<ScrapeOutcome> {
  const observedAt = new Date().toISOString()

  try {
    const { body: html, status, url } = await fetchHtml(item.normalizedUrl)

    const payload: Record<string, unknown> = {
      httpStatus: status,
      finalUrl: url,
      contentLength: html.length,
    }

    const title = extractTitle(html)
    if (title) payload.title = title

    const desc = extractMetaContent(html, 'description')
    if (desc) payload.metaDescription = desc

    const ogTitle = extractMetaContent(html, 'og:title')
    if (ogTitle) payload.ogTitle = ogTitle

    const ogImage = extractMetaContent(html, 'og:image')
    if (ogImage) payload.ogImage = ogImage

    const ogPrice =
      extractMetaContent(html, 'og:price:amount') ??
      extractMetaContent(html, 'product:price:amount')
    if (ogPrice) payload.ogPrice = ogPrice

    const ogCurrency =
      extractMetaContent(html, 'og:price:currency') ??
      extractMetaContent(html, 'product:price:currency')
    if (ogCurrency) payload.ogCurrency = ogCurrency

    const prices = extractPrices(html)
    if (prices.length > 0) payload.prices = prices

    const softErrorSignals = detectSoftErrorSignals({
      body: html,
      title,
      url,
    })
    const scrapeStatus =
      status >= 400 ? 'http-error' : softErrorSignals.length > 0 ? 'soft-error' : 'ok'

    payload.scrapeStatus = scrapeStatus
    if (softErrorSignals.length > 0) {
      payload.softErrorSignals = softErrorSignals
    }

    const contentHash = await computeContentHash(payload)

    let quality = 20
    if (status >= 200 && status < 400) quality += 15
    if (title) quality += 10
    if (prices.length > 0) quality += 20
    if (ogPrice) quality += 20

    if (scrapeStatus === 'http-error') {
      quality = Math.min(quality, 10)
    } else if (scrapeStatus === 'soft-error') {
      quality = Math.min(quality, 15)
    }

    const strategy =
      scrapeStatus === 'ok'
        ? 'basic-html'
        : scrapeStatus === 'soft-error'
          ? 'soft-error-html'
          : 'http-error-html'

    return {
      ok: true,
      item,
      observation: {
        sourceKey: item.sourceKey,
        fingerprint: item.fingerprint,
        normalizedUrl: item.normalizedUrl,
        externalKey: item.externalKey,
        label: item.label,
        targetMeta: item.meta,
        contentHash,
        payload,
        qualityScore: Math.min(quality, 100),
        strategy,
        observedAt,
      },
    }
  } catch (err) {
    return {
      ok: false,
      item,
      error: formatScrapeError(err),
    }
  }
}

// ── HTML extraction helpers ──────────────────────────────────

async function fetchHtml(input: string): Promise<{
  body: string
  status: number
  url: string
}> {
  try {
    const res = await fetch(input, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    return {
      body: await res.text(),
      status: res.status,
      url: res.url,
    }
  } catch (error) {
    if (!isTlsCertificateError(error)) {
      throw error
    }

    return fetchHtmlWithCurl(input)
  }
}

async function fetchHtmlWithCurl(input: string): Promise<{
  body: string
  status: number
  url: string
}> {
  const execFileAsync = promisify(execFile)
  const { stdout } = await execFileAsync(
    'curl',
    [
      '-sS',
      '-L',
      '--max-time',
      String(Math.ceil(FETCH_TIMEOUT_MS / 1000)),
      '-A',
      USER_AGENT,
      '-H',
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H',
      'Accept-Language: en-US,en;q=0.9',
      '-w',
      `\n${CURL_META_MARKER}%{http_code}\t%{url_effective}`,
      input,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  )

  const markerIndex = stdout.lastIndexOf(`\n${CURL_META_MARKER}`)
  if (markerIndex < 0) {
    throw new Error('curl fallback did not return response metadata')
  }

  const body = stdout.slice(0, markerIndex)
  const rawMeta = stdout.slice(markerIndex + 1 + CURL_META_MARKER.length).trim()
  const [statusRaw = '0', finalUrl = input] = rawMeta.split('\t')
  const status = Number(statusRaw)

  return {
    body,
    status: Number.isFinite(status) ? status : 0,
    url: finalUrl || input,
  }
}

function isTlsCertificateError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const cause = error.cause
  return Boolean(
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    (cause as { code?: string }).code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  )
}

function formatScrapeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause
    if (cause && typeof cause === 'object' && 'code' in cause) {
      const code = (cause as { code?: string }).code
      if (code) {
        return `${error.message} (${code})`
      }
    }

    return error.message
  }

  return String(error)
}

function detectSoftErrorSignals(input: {
  body: string
  title: string | null
  url: string
}): string[] {
  const bodySample = input.body.slice(0, 6_000)
  const haystack = [input.title ?? '', bodySample, input.url].join('\n')

  return SOFT_ERROR_PATTERNS.flatMap((pattern) => {
    const match = haystack.match(pattern)
    return match?.[0] ? [match[0]] : []
  })
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]?.trim() || null
}

function extractMetaContent(html: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const p1 = new RegExp(
    `<meta[^>]*(?:name|property)=["']${esc}["'][^>]*content=["']([^"']+)["']`,
    'i',
  )
  const m1 = html.match(p1)
  if (m1) return m1[1].trim()

  const p2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${esc}["']`,
    'i',
  )
  const m2 = html.match(p2)
  return m2?.[1]?.trim() || null
}

function extractPrices(html: string): string[] {
  const patterns = [
    /\$\d[\d,]*\.?\d{0,2}/g,
    /€\s?\d[\d,.]*\d/g,
    /£\s?\d[\d,.]*\d/g,
    /USD\s?\d[\d,]*\.?\d{0,2}/gi,
  ]
  const seen = new Set<string>()
  for (const p of patterns) {
    for (const m of html.matchAll(p)) {
      seen.add(m[0].trim())
    }
  }
  return [...seen].slice(0, 20)
}
