import type { EnqueueTargetsBody } from '@narduk-enterprises/scrape-contract'

export interface EnqueueTargetsResponse {
  sourceKey: string
  created: number
  existing: number
  total: number
}

function mutationErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const d = (err as { data?: { message?: string; statusMessage?: string } }).data
    const m = d?.message ?? d?.statusMessage
    if (m) return String(m)
  }
  if (err instanceof Error) return err.message
  return 'Request failed'
}

export function useScrapeEnqueue(options: { onSuccess?: () => void | Promise<void> } = {}) {
  const appFetch = useAppFetch()
  const toast = useToast()
  const pending = ref(false)

  async function enqueue(input: {
    normalizedUrls: string[]
    sourceKey: string
    sourceLabel?: string
    targetLabel?: string
    ttlHours?: number | null
  }): Promise<EnqueueTargetsResponse | undefined> {
    const sourceKey = input.sourceKey.trim()
    if (!sourceKey) {
      toast.add({
        title: 'Source key required',
        description: 'Choose a short key to group this scrape source (e.g. default, competitor-a).',
        color: 'warning',
      })
      return undefined
    }

    const body: EnqueueTargetsBody = {
      sourceKey,
      sourceLabel: input.sourceLabel?.trim() || undefined,
      targets: input.normalizedUrls.map((normalizedUrl) => ({
        normalizedUrl,
        label: input.targetLabel?.trim() || undefined,
      })),
    }

    if (input.ttlHours != null && Number.isFinite(input.ttlHours) && input.ttlHours > 0) {
      const sec = Math.round(input.ttlHours * 3600)
      if (sec < 60 || sec > 86400 * 365) {
        toast.add({
          title: 'Invalid TTL',
          description: 'TTL must be between 1 minute and 365 days when set.',
          color: 'warning',
        })
        return undefined
      }
      body.defaultTtlSeconds = sec
    }

    pending.value = true
    try {
      const res = await appFetch<EnqueueTargetsResponse>('/api/scrape/admin/targets', {
        method: 'POST',
        body,
      })
      const summary =
        res.created > 0
          ? `${res.created} new target(s) queued · ${res.existing} already known`
          : `${res.existing} existing target(s) refreshed`
      toast.add({
        title: 'Scrape queued',
        description: summary,
        color: 'success',
      })
      await options.onSuccess?.()
      return res
    } catch (err: unknown) {
      toast.add({
        title: 'Could not queue scrape',
        description: mutationErrorMessage(err),
        color: 'error',
      })
      return undefined
    } finally {
      pending.value = false
    }
  }

  return { pending, enqueue }
}
