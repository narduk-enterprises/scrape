/**
 * Deterministic JSON for stable content hashing (sorted object keys, recursively).
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()

  function walk(v: unknown): string {
    if (v === null || typeof v !== 'object') {
      return JSON.stringify(v)
    }
    if (seen.has(v as object)) {
      return '"[Circular]"'
    }
    seen.add(v as object)
    if (Array.isArray(v)) {
      const inner = v.map((x) => walk(x)).join(',')
      return `[${inner}]`
    }
    const o = v as Record<string, unknown>
    const keys = Object.keys(o).sort()
    const parts = keys.map((k) => `${JSON.stringify(k)}:${walk(o[k])}`)
    return `{${parts.join(',')}}`
  }

  return walk(value)
}

/** SHA-256 hex; uses Web Crypto (Workers + modern Node). */
export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Identity fingerprint for a scrape target (dedupe scheduling). */
export async function computeTargetFingerprint(input: {
  sourceKey: string
  normalizedUrl: string
  externalKey?: string | null
}): Promise<string> {
  const canonical = stableStringify({
    s: input.sourceKey.trim().toLowerCase(),
    u: input.normalizedUrl.trim(),
    k: input.externalKey?.trim() || null,
  })
  return sha256Hex(canonical)
}

/** Hash of extracted payload — identical facts skip re-storage. */
export async function computeContentHash(payload: unknown): Promise<string> {
  return sha256Hex(stableStringify(payload))
}
