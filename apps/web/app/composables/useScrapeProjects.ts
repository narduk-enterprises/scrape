import type { ComputedRef, Ref } from 'vue'

export type ScrapeSeedRunState = 'http-error' | 'never-run' | 'ok' | 'queued' | 'soft-error'

export interface ScrapeProjectSummary {
  id: string
  slug: string
  name: string
  description: string | null
  customerName: string | null
  catalogSource: string | null
  defaultCurrency: string
  externalProjectId: string | null
  createdAt: string
  updatedAt: string
  counts: {
    catalogItems: number
    competitors: number
    scrapeSeeds: number
  }
}

export interface ScrapeProjectCatalogItem {
  id: string
  externalItemId: string
  partNumber: string
  manufacturerCode: string | null
  manufacturerName: string | null
  partDescription: string | null
  itemType: string | null
  quantity: number | null
  seedCount: number
}

export interface ScrapeProjectSeed {
  id: string
  targetFingerprint: string
  normalizedUrl: string
  externalKey: string | null
  label: string | null
  seedType: string
  searchTerm: string | null
  isActive: boolean
  catalogItemId: string | null
  catalogItemExternalId: string | null
  catalogItemPartNumber: string | null
  catalogItemManufacturerName: string | null
  meta: Record<string, unknown> | null
  runState: ScrapeSeedRunState
  lastObservedAt: string | null
  lastScrapeStatus: string | null
  lastHttpStatus: number | null
  lastQualityScore: number | null
  lastStrategy: string | null
  lastTitle: string | null
  softErrorSignals: string[]
  pendingJobCount: number
}

export interface ScrapeProjectCompetitor {
  id: string
  sourceKey: string
  sourceLabel: string | null
  defaultTtlSeconds: number
  isActive: boolean
  notes: string | null
  meta: Record<string, unknown> | null
  organizationName: string
  organizationDomain: string | null
  organizationWebsiteUrl: string | null
  scrapeSeedCount: number
  statusCounts: {
    httpError: number
    neverRun: number
    ok: number
    queued: number
    softError: number
  }
  seeds: ScrapeProjectSeed[]
}

export interface ScrapeProjectDetail extends ScrapeProjectSummary {
  meta: Record<string, unknown> | null
  catalogItems: ScrapeProjectCatalogItem[]
  competitors: ScrapeProjectCompetitor[]
}

interface ScrapeProjectListResponse {
  projects: ScrapeProjectSummary[]
}

interface ScrapeProjectDetailResponse {
  project: ScrapeProjectDetail
}

export interface RunProjectResponse {
  projectName: string
  projectSlug: string
  requestedSeeds: number
  createdTargets: number
  queuedJobs: number
  existingQueuedJobs: number
}

function mutationErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { message?: string; statusMessage?: string } }).data
    const message = data?.message ?? data?.statusMessage
    if (message) {
      return String(message)
    }
  }

  if (err instanceof Error) {
    return err.message
  }

  return 'Request failed'
}

export function useScrapeProjects() {
  const {
    data,
    error: projectsError,
    refresh: refreshProjects,
    pending: projectsPending,
  } = useFetch<ScrapeProjectListResponse>('/api/scrape/admin/projects', { server: false })

  const projects = computed(() => data.value?.projects ?? [])

  return {
    projects,
    projectsError,
    projectsPending,
    refreshProjects,
  }
}

export function useScrapeProject(projectSlug: Ref<string> | ComputedRef<string>) {
  const {
    data,
    error: projectError,
    refresh: refreshProject,
    pending: projectPending,
  } = useFetch<ScrapeProjectDetailResponse>(
    () => `/api/scrape/admin/projects/${projectSlug.value}`,
    { watch: [projectSlug], server: false },
  )

  const project = computed(() => data.value?.project ?? null)

  return {
    project,
    projectError,
    projectPending,
    refreshProject,
  }
}

export function useScrapeProjectRun(options: { onSuccess?: () => void | Promise<void> } = {}) {
  const appFetch = useAppFetch()
  const toast = useToast()
  const pending = ref(false)

  async function runProject(projectSlug: string): Promise<RunProjectResponse | undefined> {
    if (!projectSlug.trim()) {
      return undefined
    }

    pending.value = true
    try {
      const response = await appFetch<RunProjectResponse>(
        `/api/scrape/admin/projects/${projectSlug}/run`,
        {
          method: 'POST',
        },
      )
      toast.add({
        title: 'Project run queued',
        description:
          response.queuedJobs > 0
            ? `${response.queuedJobs} seed job(s) queued now · ${response.existingQueuedJobs} already waiting`
            : `${response.existingQueuedJobs} seed job(s) were already queued`,
        color: 'success',
      })
      await options.onSuccess?.()
      return response
    } catch (error: unknown) {
      toast.add({
        title: 'Could not queue project run',
        description: mutationErrorMessage(error),
        color: 'error',
      })
      return undefined
    } finally {
      pending.value = false
    }
  }

  return {
    pending,
    runProject,
  }
}
