import { h } from 'vue'

export interface ScrapeSummary {
  counts: {
    sources: number
    targets: number
    observations: number
    runs: number
    agents: number
    targetsNeedingWork: number
  }
}

export interface ScrapeObservationRow {
  id: string
  observedAt: string
  contentHash: string
  qualityScore: number | null
  strategy: string | null
  normalizedUrl: string
  sourceKey: string
  payload: Record<string, unknown>
}

type ObsCellCtx = { row: { original: ScrapeObservationRow } }

export function useScrapeDashboard(page: Ref<number>, limit: number) {
  const {
    data: summary,
    error: summaryError,
    refresh: refreshSummary,
    pending: summaryPending,
  } = useFetch<ScrapeSummary>('/api/scrape/admin/summary', { server: false })

  const {
    data: obsPage,
    error: obsError,
    refresh: refreshObs,
    pending: obsPending,
  } = useFetch<{
    observations: ScrapeObservationRow[]
    total: number
    page: number
    limit: number
  }>(
    () => `/api/scrape/admin/observations?page=${page.value}&limit=${limit}`,
    { watch: [page], server: false },
  )

  function payloadPreview(p: Record<string, unknown>): string {
    try {
      const s = JSON.stringify(p)
      return s.length > 120 ? `${s.slice(0, 120)}…` : s
    } catch {
      return '…'
    }
  }

  const obsColumns = computed(() => [
    {
      accessorKey: 'observedAt',
      header: 'When',
      cell: ({ row }: ObsCellCtx) =>
        h(
          'span',
          { class: 'whitespace-nowrap text-dimmed text-sm' },
          row.original.observedAt.slice(0, 19).replace('T', ' '),
        ),
    },
    { accessorKey: 'sourceKey', header: 'Source' },
    {
      accessorKey: 'normalizedUrl',
      header: 'URL',
      cell: ({ row }: ObsCellCtx) =>
        h(
          'span',
          { class: 'font-mono text-xs max-w-[14rem] truncate block' },
          row.original.normalizedUrl,
        ),
    },
    {
      id: 'hash',
      header: 'Hash',
      cell: ({ row }: ObsCellCtx) =>
        h('span', { class: 'font-mono text-xs' }, `${row.original.contentHash.slice(0, 10)}…`),
    },
    {
      accessorKey: 'qualityScore',
      header: 'Q',
      cell: ({ row }: ObsCellCtx) => String(row.original.qualityScore ?? '—'),
    },
    {
      id: 'payload',
      header: 'Payload',
      cell: ({ row }: ObsCellCtx) =>
        h(
          'span',
          { class: 'font-mono text-xs text-dimmed max-w-md block' },
          payloadPreview(row.original.payload),
        ),
    },
  ])

  return {
    summary,
    summaryError,
    summaryPending,
    refreshSummary,
    obsPage,
    obsError,
    obsPending,
    refreshObs,
    obsColumns,
  }
}
