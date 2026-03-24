export function normalizeScrapeUrlInput(raw: string): string {
  const t = raw.trim()
  if (!t) {
    throw new Error('URL is required')
  }
  const withProto = t.includes('://') ? t : `https://${t}`
  let u: URL
  try {
    u = new URL(withProto)
  } catch {
    throw new Error('Enter a valid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported')
  }
  u.hash = ''
  return u.href
}

export function normalizeScrapeUrlInputs(rawLines: string[]): { ok: string[] } | { error: string } {
  const lines = rawLines.map((l) => l.trim()).filter(Boolean)
  if (!lines.length) {
    return { error: 'Enter at least one URL' }
  }
  const ok: string[] = []
  for (const line of lines) {
    try {
      ok.push(normalizeScrapeUrlInput(line))
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid URL' }
    }
  }
  return { ok }
}
