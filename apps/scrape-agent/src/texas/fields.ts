export function pickField(obj: Record<string, string>, ...candidates: string[]): string {
  for (const k of candidates) {
    const v = obj[k]
    if (v !== undefined && v.trim().length > 0) return v.trim()
  }
  return ''
}
