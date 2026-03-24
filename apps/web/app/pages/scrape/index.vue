<script setup lang="ts">
import { z } from 'zod'
import { normalizeScrapeUrlInputs } from '~~/utils/scrape-url'

const config = useRuntimeConfig()
const appName = config.public.appName || 'Scrape'
const route = useRoute()
const { user, loggedIn } = useAuth()

useSeo({
  title: `${appName} — Scrape ops`,
  description: 'Targets, observations, and agent queue health.',
})
useWebPageSchema({
  name: `${appName} — Scrape ops`,
  description: 'Targets, observations, and agent queue health.',
})

function parsePageQuery(value: string | null | Array<string | null> | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

const page = shallowRef(parsePageQuery(route.query.page))
const limit = 15

const {
  summary,
  summaryError,
  summaryPending,
  refreshSummary,
  projects,
  projectsError,
  projectsPending,
  refreshProjects,
  obsPage,
  obsError,
  obsPending,
  refreshObs,
} = useScrapeDashboard(page, limit)

const toast = useToast()

const enqueueSchema = z
  .object({
    urlInput: z.string(),
    urlBulk: z.string(),
    sourceKey: z.string().min(1, 'Source key is required'),
    sourceLabel: z.string(),
    targetLabel: z.string(),
    ttlHours: z.string(),
  })
  .refine((val) => val.urlBulk.trim().length > 0 || val.urlInput.trim().length > 0, {
    message: 'Enter a URL or paste multiple URLs (one per line).',
    path: ['urlInput'],
  })

const enqueueState = reactive({
  urlInput: '',
  urlBulk: '',
  sourceKey: 'default',
  sourceLabel: '',
  targetLabel: '',
  ttlHours: '',
})

const { pending: enqueuePending, enqueue } = useScrapeEnqueue({
  onSuccess: async () => {
    enqueueState.urlInput = ''
    enqueueState.urlBulk = ''
    enqueueState.sourceKey = 'default'
    enqueueState.sourceLabel = ''
    enqueueState.targetLabel = ''
    enqueueState.ttlHours = ''
    await Promise.all([refreshSummary(), refreshProjects(), refreshObs()])
  },
})

const isAdmin = computed(() => user.value?.isAdmin === true)

async function onEnqueueSubmit() {
  const parsed = enqueueSchema.safeParse(enqueueState)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(' ')
    toast.add({ title: 'Check the form', description: msg, color: 'warning' })
    return
  }
  const s = parsed.data
  const bulk = s.urlBulk.trim()
  const lines = bulk ? bulk.split('\n') : [s.urlInput]
  const norm = normalizeScrapeUrlInputs(lines)
  if ('error' in norm) {
    toast.add({ title: 'Check URLs', description: norm.error, color: 'warning' })
    return
  }
  const hoursRaw = s.ttlHours.trim()
  let ttlHoursArg: number | null = null
  if (hoursRaw !== '') {
    const ttlParsed = Number(hoursRaw)
    if (!Number.isFinite(ttlParsed) || ttlParsed <= 0) {
      toast.add({
        title: 'Invalid TTL',
        description: 'Leave TTL empty or enter a positive number of hours.',
        color: 'warning',
      })
      return
    }
    ttlHoursArg = ttlParsed
  }
  await enqueue({
    normalizedUrls: norm.ok,
    sourceKey: s.sourceKey,
    sourceLabel: s.sourceLabel || undefined,
    targetLabel: s.targetLabel || undefined,
    ttlHours: ttlHoursArg,
  })
}

const statItems = computed(() => {
  const c = summary.value?.counts
  if (!c) return []
  return [
    { label: 'Projects', value: c.projects, icon: 'i-lucide-folder-kanban' },
    { label: 'Catalog items', value: c.catalogItems, icon: 'i-lucide-package-search' },
    { label: 'Project seeds', value: c.projectSeeds, icon: 'i-lucide-radar' },
    { label: 'Sources', value: c.sources, icon: 'i-lucide-database' },
    { label: 'Targets', value: c.targets, icon: 'i-lucide-crosshair' },
    { label: 'Observations', value: c.observations, icon: 'i-lucide-binoculars' },
    { label: 'Runs', value: c.runs, icon: 'i-lucide-play-circle' },
    { label: 'Agents', value: c.agents, icon: 'i-lucide-cpu' },
    { label: 'Queue (stale / empty)', value: c.targetsNeedingWork, icon: 'i-lucide-list-todo' },
  ]
})
</script>

<template>
  <UPage>
    <UPageHero
      title="Scrape operations"
      description="Deduplicated targets and observations. Agents pull work with TTL rules; identical payloads are not stored twice."
      :ui="{ title: 'text-4xl sm:text-5xl', description: 'text-lg text-muted' }"
    >
      <template #links>
        <div class="flex flex-wrap gap-2 justify-center">
          <UButton
            to="/scrape/projects"
            color="neutral"
            variant="subtle"
            icon="i-lucide-folder-kanban"
          >
            Projects
          </UButton>
          <UButton
            v-if="loggedIn && isAdmin"
            icon="i-lucide-refresh-cw"
            variant="subtle"
            @click="
              () => {
                refreshSummary()
                refreshProjects()
                refreshObs()
              }
            "
          >
            Refresh
          </UButton>
        </div>
      </template>
    </UPageHero>

    <UPageSection>
      <UAlert
        v-if="!loggedIn"
        color="warning"
        variant="subtle"
        title="Sign in required"
        description="Log in as an admin to view scrape metrics and recent observations."
        icon="i-lucide-lock"
        class="max-w-2xl mx-auto"
      />

      <UAlert
        v-else-if="!isAdmin"
        color="error"
        variant="subtle"
        title="Admin only"
        description="Your account does not have admin access to scrape APIs."
        icon="i-lucide-shield-off"
        class="max-w-2xl mx-auto"
      />

      <template v-else-if="isAdmin">
        <UCard class="max-w-6xl mx-auto mb-10">
          <template #header>
            <div class="flex flex-col gap-1">
              <h2 class="text-lg font-semibold">Queue a scrape</h2>
              <p class="text-sm text-muted">
                Targets are deduped by URL. Agents pick up work when a target is stale for its
                source TTL (default 24h for new sources).
              </p>
            </div>
          </template>

          <UForm
            :schema="enqueueSchema"
            :state="enqueueState"
            class="space-y-4"
            @submit.prevent="onEnqueueSubmit"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                name="urlInput"
                label="URL"
                description="https:// is added if missing."
                class="sm:col-span-2"
              >
                <UInput
                  v-model="enqueueState.urlInput"
                  type="url"
                  placeholder="https://example.com/product"
                  class="w-full"
                  :disabled="Boolean(enqueueState.urlBulk.trim())"
                />
              </UFormField>

              <UFormField
                name="urlBulk"
                label="URLs (optional bulk)"
                description="One URL per line. When set, the single URL field is ignored."
                class="sm:col-span-2"
              >
                <UTextarea
                  v-model="enqueueState.urlBulk"
                  autoresize
                  :rows="3"
                  placeholder="https://a.example.com&#10;https://b.example.com"
                  class="w-full font-mono text-sm"
                />
              </UFormField>

              <UFormField
                name="sourceKey"
                label="Source key"
                description="Stable id for this channel (creates the source on first use)."
              >
                <UInput v-model="enqueueState.sourceKey" class="w-full" autocomplete="off" />
              </UFormField>

              <UFormField
                name="sourceLabel"
                label="Source label (optional)"
                description="Human-readable name stored on the source."
              >
                <UInput
                  v-model="enqueueState.sourceLabel"
                  class="w-full"
                  placeholder="Acme competitor"
                />
              </UFormField>

              <UFormField
                name="targetLabel"
                label="Target label (optional)"
                description="Applied to every URL in this submission."
              >
                <UInput
                  v-model="enqueueState.targetLabel"
                  class="w-full"
                  placeholder="SKU / campaign tag"
                />
              </UFormField>

              <UFormField
                name="ttlHours"
                label="TTL (hours, optional)"
                description="Overrides default freshness window for this source when set."
              >
                <UInput
                  v-model="enqueueState.ttlHours"
                  type="number"
                  min="0.02"
                  step="any"
                  class="w-full"
                  placeholder="24"
                />
              </UFormField>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                type="submit"
                icon="i-lucide-plus-circle"
                :loading="enqueuePending"
                :disabled="enqueuePending"
              >
                Queue targets
              </UButton>
            </div>
          </UForm>
        </UCard>

        <UAlert
          v-if="summaryError"
          color="error"
          variant="subtle"
          title="Could not load summary"
          :description="summaryError.message || 'Request failed'"
          icon="i-lucide-alert-circle"
          class="max-w-2xl mx-auto mb-6"
        />

        <div v-else-if="summaryPending && !summary" class="flex justify-center py-12">
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
        </div>

        <template v-else>
          <div
            class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-3 sm:gap-4 max-w-6xl mx-auto mb-10"
          >
            <UCard
              v-for="s in statItems"
              :key="s.label"
              variant="subtle"
              class="text-center border-default shadow-card"
            >
              <UIcon :name="s.icon" class="size-6 text-primary mx-auto mb-2" />
              <p class="text-2xl font-semibold tabular-nums">{{ s.value }}</p>
              <p class="text-xs text-muted">{{ s.label }}</p>
            </UCard>
          </div>

          <ScrapeProjectsCard
            class="mb-10"
            :error="projectsError"
            :pending="projectsPending"
            :projects="projects"
          />

          <ScrapeObservationsCard
            :error="obsError"
            :limit="limit"
            :observations="obsPage?.observations ?? []"
            :page="page"
            :pending="obsPending"
            :total="obsPage?.total ?? 0"
            @update:page="page = $event"
          />
        </template>
      </template>
    </UPageSection>
  </UPage>
</template>
