import type { ComputedRef, Ref } from 'vue'

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

export interface ScrapeObservationPage {
  observations: ScrapeObservationRow[]
  total: number
  page: number
  limit: number
}

export interface ScrapeObservationDetail extends ScrapeObservationRow {
  createdAt: string
  artifactRef: string | null
  targetId: string
  targetLabel: string | null
  targetExternalKey: string | null
  targetCreatedAt: string
  targetUpdatedAt: string
  targetMeta: Record<string, unknown> | null
  sourceId: string
  sourceLabel: string | null
  sourceDefaultTtlSeconds: number
  runId: string
  runStatus: string
  runStartedAt: string
  runFinishedAt: string | null
  runType: string | null
  runSourceDomain: string | null
  runConnectorKey: string | null
  runRecordsCreated: number | null
  runRecordsUpdated: number | null
  runRecordsSkipped: number | null
  runParseErrorCount: number | null
  runMeta: Record<string, unknown> | null
  agentId: string | null
  agentHostname: string | null
  agentVersion: string | null
  agentLastSeenAt: string | null
}

interface ScrapeObservationDetailResponse {
  observation: ScrapeObservationDetail
}

export function useScrapeObservation(observationId: Ref<string> | ComputedRef<string>) {
  const {
    data,
    error: observationError,
    refresh: refreshObservation,
    pending: observationPending,
  } = useFetch<ScrapeObservationDetailResponse>(
    () => `/api/scrape/admin/observations/${observationId.value}`,
    { watch: [observationId], server: false },
  )

  const observation = computed(() => data.value?.observation ?? null)

  return {
    observation,
    observationError,
    observationPending,
    refreshObservation,
  }
}
