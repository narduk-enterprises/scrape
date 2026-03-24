import type { ScrapeObservationPage } from './useScrapeObservation'
import type { ScrapeProjectSummary } from './useScrapeProjects'

export interface ScrapeSummary {
  counts: {
    sources: number
    targets: number
    observations: number
    runs: number
    agents: number
    targetsNeedingWork: number
    projects: number
    catalogItems: number
    projectSeeds: number
  }
}

export function useScrapeDashboard(page: Ref<number>, limit: number) {
  const {
    data: summary,
    error: summaryError,
    refresh: refreshSummary,
    pending: summaryPending,
  } = useFetch<ScrapeSummary>('/api/scrape/admin/summary', { server: false })

  const {
    data: projectsData,
    error: projectsError,
    refresh: refreshProjects,
    pending: projectsPending,
  } = useFetch<{ projects: ScrapeProjectSummary[] }>('/api/scrape/admin/projects', {
    server: false,
  })

  const {
    data: obsPage,
    error: obsError,
    refresh: refreshObs,
    pending: obsPending,
  } = useFetch<ScrapeObservationPage>(
    () => `/api/scrape/admin/observations?page=${page.value}&limit=${limit}`,
    { watch: [page], server: false },
  )

  return {
    summary,
    summaryError,
    summaryPending,
    refreshSummary,
    projects: computed(() => projectsData.value?.projects ?? []),
    projectsError,
    projectsPending,
    refreshProjects,
    obsPage,
    obsError,
    obsPending,
    refreshObs,
  }
}
