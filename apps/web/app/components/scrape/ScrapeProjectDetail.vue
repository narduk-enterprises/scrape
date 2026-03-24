<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type {
  ScrapeProjectDetail,
  ScrapeProjectSeed,
  ScrapeSeedRunState,
} from '../../composables/useScrapeProjects'

interface DetailFact {
  label: string
  value: string
  icon: string
}

const props = defineProps<{
  backTo: RouteLocationRaw
  project: ScrapeProjectDetail
  runPending: boolean
}>()

const emit = defineEmits<{
  'refresh-project': []
  'run-project': []
}>()

const breadcrumbs = computed(() => [
  {
    label: 'Projects',
    icon: 'i-lucide-folder-kanban',
    to: props.backTo,
  },
  {
    label: 'Project',
    icon: 'i-lucide-folder-kanban',
  },
])

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return 'Unable to render JSON'
  }
}

function formatTtl(seconds: number): string {
  if (seconds % 86_400 === 0) {
    return `${seconds / 86_400} day` + (seconds / 86_400 === 1 ? '' : 's')
  }

  if (seconds % 3_600 === 0) {
    return `${seconds / 3_600} hour` + (seconds / 3_600 === 1 ? '' : 's')
  }

  return `${seconds.toLocaleString('en-US')}s`
}

function toHostLabel(url: string | null): string | null {
  if (!url) {
    return null
  }

  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function seedStateColor(state: ScrapeSeedRunState) {
  if (state === 'ok') {
    return 'success'
  }
  if (state === 'queued') {
    return 'primary'
  }
  if (state === 'soft-error') {
    return 'warning'
  }
  if (state === 'http-error') {
    return 'error'
  }

  return 'neutral'
}

function seedStateLabel(seed: ScrapeProjectSeed): string {
  if (seed.runState === 'queued') {
    return seed.pendingJobCount > 1 ? `${seed.pendingJobCount} queued` : 'Queued'
  }
  if (seed.runState === 'ok') {
    return 'Usable'
  }
  if (seed.runState === 'soft-error') {
    return 'Soft error'
  }
  if (seed.runState === 'http-error') {
    return 'Blocked'
  }

  return 'Not run'
}

const projectMeta = computed(() => (props.project.meta ? formatJson(props.project.meta) : null))
const activeSeedCount = computed(() =>
  props.project.competitors.reduce(
    (count, competitor) => count + competitor.seeds.filter((seed) => seed.isActive).length,
    0,
  ),
)
const queuedSeedCount = computed(() =>
  props.project.competitors.reduce(
    (count, competitor) =>
      count + competitor.seeds.reduce((seedCount, seed) => seedCount + seed.pendingJobCount, 0),
    0,
  ),
)

const topFacts = computed<DetailFact[]>(() =>
  [
    {
      label: 'Catalog items',
      value: props.project.counts.catalogItems.toLocaleString('en-US'),
      icon: 'i-lucide-package-search',
    },
    {
      label: 'Competitor channels',
      value: props.project.counts.competitors.toLocaleString('en-US'),
      icon: 'i-lucide-building-2',
    },
    {
      label: 'Scrape seeds',
      value: props.project.counts.scrapeSeeds.toLocaleString('en-US'),
      icon: 'i-lucide-radar',
    },
    {
      label: 'Queued now',
      value: queuedSeedCount.value.toLocaleString('en-US'),
      icon: 'i-lucide-list-todo',
    },
    {
      label: 'Currency',
      value: props.project.defaultCurrency,
      icon: 'i-lucide-badge-dollar-sign',
    },
  ].filter((fact) => fact.value.length > 0),
)

const catalogItemColumns = [
  { accessorKey: 'manufacturerName', header: 'Manufacturer' },
  { accessorKey: 'partNumber', header: 'Part' },
  { accessorKey: 'partDescription', header: 'Description' },
  { accessorKey: 'seedCount', header: 'Seeds' },
]
</script>

<template>
  <div class="space-y-6">
    <UBreadcrumb :items="breadcrumbs" />

    <section
      class="relative overflow-hidden rounded-[1.75rem] border border-default bg-linear-to-br from-info/12 via-default to-default px-6 py-6 shadow-card sm:px-8"
    >
      <div class="absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-primary/12 to-transparent" />
      <div class="absolute -left-12 top-6 size-44 rounded-full bg-success/10 blur-3xl" />

      <div class="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-5 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="primary" variant="soft">
              {{ project.slug }}
            </UBadge>
            <UBadge v-if="project.customerName" color="neutral" variant="soft">
              {{ project.customerName }}
            </UBadge>
            <UBadge color="neutral" variant="soft">
              {{ project.defaultCurrency }}
            </UBadge>
          </div>

          <div class="space-y-3">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
              Project dossier
            </p>
            <h1 class="font-display text-3xl text-balance text-default sm:text-4xl lg:text-5xl">
              {{ project.name }}
            </h1>
            <p class="max-w-3xl text-sm leading-7 text-muted sm:text-base">
              {{
                project.description ||
                'Imported catalog project with linked competitor sources and seed scrape targets.'
              }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge color="neutral" variant="soft">
                {{ activeSeedCount.toLocaleString('en-US') }} active seeds
              </UBadge>
              <UBadge color="neutral" variant="soft">
                {{ queuedSeedCount.toLocaleString('en-US') }} queued
              </UBadge>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex flex-wrap justify-start gap-2 lg:justify-end">
            <UButton
              icon="i-lucide-play"
              :loading="runPending"
              :disabled="activeSeedCount === 0"
              @click="emit('run-project')"
            >
              Run project seeds
            </UButton>
            <UButton icon="i-lucide-refresh-cw" variant="subtle" @click="emit('refresh-project')">
              Refresh status
            </UButton>
            <UButton color="neutral" variant="subtle" icon="i-lucide-arrow-left" :to="backTo">
              All projects
            </UButton>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div
              v-for="fact in topFacts"
              :key="fact.label"
              class="rounded-2xl border border-default bg-elevated/75 px-4 py-4 backdrop-blur"
            >
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon :name="fact.icon" class="size-4 text-primary" />
                <span>{{ fact.label }}</span>
              </div>
              <p class="mt-3 text-xl font-semibold text-default">{{ fact.value }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(20rem,1fr)]">
      <UCard class="border-default shadow-card">
        <template #header>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-default">Catalog import</h2>
            <p class="text-sm text-muted">
              Seeded project metadata and the imported catalog footprint.
            </p>
          </div>
        </template>

        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <span class="text-muted">External project id</span>
            <code class="max-w-full break-all rounded bg-elevated px-2 py-1 text-xs text-default">
              {{ project.externalProjectId || 'Not set' }}
            </code>
          </div>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <span class="text-muted">Catalog source</span>
            <code class="max-w-full break-all rounded bg-elevated px-2 py-1 text-xs text-default">
              {{ project.catalogSource || 'Not set' }}
            </code>
          </div>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <span class="text-muted">Created</span>
            <span class="text-default">{{ formatDateTime(project.createdAt) }}</span>
          </div>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <span class="text-muted">Updated</span>
            <span class="text-default">{{ formatDateTime(project.updatedAt) }}</span>
          </div>
        </div>

        <div v-if="projectMeta" class="mt-5 rounded-2xl border border-default bg-elevated/50 p-4">
          <p class="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Project metadata
          </p>
          <pre
            class="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-default"
            >{{ projectMeta }}</pre
          >
        </div>
      </UCard>

      <UCard class="border-default shadow-card">
        <template #header>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-default">Competitor channels</h2>
            <p class="text-sm text-muted">
              Each channel contributes seed URLs that the worker can turn into observations.
            </p>
          </div>
        </template>

        <div class="space-y-4">
          <div
            v-for="competitor in project.competitors"
            :key="competitor.id"
            class="rounded-2xl border border-default bg-elevated/50 p-4"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="primary" variant="soft">
                {{ competitor.sourceLabel || competitor.sourceKey }}
              </UBadge>
              <UBadge color="neutral" variant="soft">
                {{ competitor.scrapeSeedCount.toLocaleString('en-US') }} seeds
              </UBadge>
              <UBadge color="neutral" variant="soft">
                TTL {{ formatTtl(competitor.defaultTtlSeconds) }}
              </UBadge>
              <UBadge v-if="competitor.statusCounts.ok > 0" color="success" variant="soft">
                {{ competitor.statusCounts.ok }} usable
              </UBadge>
              <UBadge v-if="competitor.statusCounts.softError > 0" color="warning" variant="soft">
                {{ competitor.statusCounts.softError }} soft error
              </UBadge>
              <UBadge v-if="competitor.statusCounts.httpError > 0" color="error" variant="soft">
                {{ competitor.statusCounts.httpError }} blocked
              </UBadge>
              <UBadge v-if="competitor.statusCounts.queued > 0" color="primary" variant="soft">
                {{ competitor.statusCounts.queued }} queued
              </UBadge>
            </div>

            <div class="mt-3 space-y-2 text-sm">
              <p class="font-medium text-default">{{ competitor.organizationName }}</p>
              <p v-if="competitor.notes" class="text-muted">
                {{ competitor.notes }}
              </p>
              <p class="text-xs text-muted">
                {{
                  competitor.organizationDomain ||
                  toHostLabel(competitor.organizationWebsiteUrl) ||
                  'No domain recorded'
                }}
              </p>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UCard class="border-default shadow-card">
      <template #header>
        <div class="space-y-1">
          <h2 class="text-lg font-semibold text-default">Catalog items</h2>
          <p class="text-sm text-muted">
            Imported parts, grouped by manufacturer, with the number of scrape seeds linked to each
            item.
          </p>
        </div>
      </template>

      <div class="space-y-3 md:hidden">
        <UCard
          v-for="item in project.catalogItems"
          :key="item.id"
          class="border-default shadow-none"
        >
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="neutral" variant="soft">
                {{ item.manufacturerCode || 'N/A' }}
              </UBadge>
              <UBadge color="primary" variant="soft">
                {{ item.seedCount.toLocaleString('en-US') }} seeds
              </UBadge>
            </div>

            <div class="space-y-1">
              <p class="font-medium text-default">{{ item.partNumber }}</p>
              <p class="text-sm text-muted">
                {{ item.manufacturerName || 'Unknown manufacturer' }}
              </p>
            </div>

            <p v-if="item.partDescription" class="text-sm text-default">
              {{ item.partDescription }}
            </p>

            <code class="block break-all rounded bg-elevated px-2 py-1 text-xs text-default">
              {{ item.externalItemId }}
            </code>
          </div>
        </UCard>
      </div>

      <UTable
        :data="project.catalogItems"
        :columns="catalogItemColumns"
        class="hidden md:block w-full min-w-0"
        :ui="{ th: 'text-left', td: 'align-top' }"
      >
        <template #manufacturerName-cell="{ row }">
          <div class="space-y-1">
            <p class="font-medium text-default">
              {{ row.original.manufacturerName || 'Unknown manufacturer' }}
            </p>
            <p class="text-xs text-muted">{{ row.original.manufacturerCode || 'No code' }}</p>
          </div>
        </template>

        <template #partNumber-cell="{ row }">
          <div class="space-y-1">
            <p class="font-medium text-default">{{ row.original.partNumber }}</p>
            <code class="block break-all text-xs text-muted">{{
              row.original.externalItemId
            }}</code>
          </div>
        </template>

        <template #partDescription-cell="{ row }">
          <p class="text-default">
            {{ row.original.partDescription || 'No description' }}
          </p>
        </template>

        <template #seedCount-cell="{ row }">
          <UBadge color="primary" variant="soft">
            {{ row.original.seedCount.toLocaleString('en-US') }}
          </UBadge>
        </template>
      </UTable>
    </UCard>

    <UCard class="border-default shadow-card">
      <template #header>
        <div class="space-y-1">
          <h2 class="text-lg font-semibold text-default">Seed targets</h2>
          <p class="text-sm text-muted">
            Searches and URLs the worker can poll to build out each project catalog.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UCard
          v-for="competitor in project.competitors"
          :key="`${competitor.id}-seeds`"
          class="border-default shadow-none"
        >
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="font-semibold text-default">
                  {{ competitor.sourceLabel || competitor.sourceKey }}
                </h3>
                <p class="text-sm text-muted">{{ competitor.organizationName }}</p>
              </div>
              <UBadge color="neutral" variant="soft">
                {{ competitor.scrapeSeedCount.toLocaleString('en-US') }} seeds
              </UBadge>
            </div>
          </template>

          <div
            v-if="competitor.seeds.length === 0"
            class="rounded-2xl border border-dashed border-default px-4 py-6 text-center text-sm text-muted"
          >
            No seeds attached to this channel yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="seed in competitor.seeds"
              :key="seed.id"
              class="rounded-2xl border border-default bg-elevated/50 px-4 py-4"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="primary" variant="soft">
                  {{ seed.seedType }}
                </UBadge>
                <UBadge v-if="seed.catalogItemPartNumber" color="neutral" variant="soft">
                  {{ seed.catalogItemPartNumber }}
                </UBadge>
                <UBadge :color="seedStateColor(seed.runState)" variant="soft">
                  {{ seedStateLabel(seed) }}
                </UBadge>
                <UBadge v-if="seed.lastHttpStatus !== null" color="neutral" variant="soft">
                  HTTP {{ seed.lastHttpStatus }}
                </UBadge>
                <UBadge v-if="seed.lastQualityScore !== null" color="neutral" variant="soft">
                  {{ seed.lastQualityScore }}/100
                </UBadge>
              </div>

              <div class="mt-3 space-y-2">
                <p class="font-medium text-default break-words">
                  {{ seed.label || seed.searchTerm || seed.normalizedUrl }}
                </p>
                <p v-if="seed.lastTitle" class="text-sm text-muted break-words">
                  Last title: {{ seed.lastTitle }}
                </p>
                <p class="text-xs text-muted break-all">{{ seed.normalizedUrl }}</p>
                <p
                  v-if="seed.catalogItemManufacturerName || seed.catalogItemPartNumber"
                  class="text-sm text-muted"
                >
                  Linked item: {{ seed.catalogItemManufacturerName || 'Unknown manufacturer' }}
                  {{ seed.catalogItemPartNumber || '' }}
                </p>
                <p v-if="seed.lastObservedAt" class="text-xs text-muted">
                  Last observed {{ formatDateTime(seed.lastObservedAt) }}
                  <span v-if="seed.lastStrategy"> · {{ seed.lastStrategy }}</span>
                </p>
                <p v-else class="text-xs text-muted">No observation stored yet.</p>
              </div>

              <div v-if="seed.softErrorSignals.length > 0" class="flex flex-wrap gap-2">
                <UBadge
                  v-for="signal in seed.softErrorSignals"
                  :key="signal"
                  color="warning"
                  variant="outline"
                  size="sm"
                >
                  {{ signal }}
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </UCard>
  </div>
</template>
