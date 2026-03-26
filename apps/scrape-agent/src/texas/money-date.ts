/** Parse currency-like strings to a finite number, or null. */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s || /^n\/?a$/i.test(s)) return null
  const cleaned = s.replace(/[$€£\s]/g, '').replace(/,/g, '')
  if (!cleaned || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/** Best-effort date → ISO calendar date (UTC midnight). */
export function parseToIsoDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  if (ISO_DATE.test(s)) return s
  const us = s.match(US_DATE)
  if (us) {
    const mm = us[1]!.padStart(2, '0')
    const dd = us[2]!.padStart(2, '0')
    const yyyy = us[3]!
    return `${yyyy}-${mm}-${dd}`
  }
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}
