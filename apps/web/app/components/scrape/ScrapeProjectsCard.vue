<script setup lang="ts">
import type { ScrapeProjectSummary } from '../../composables/useScrapeProjects'

interface ErrorLike {
  message?: string
}

const props = defineProps<{
  error: ErrorLike | null | undefined
  pending: boolean
  projects: ScrapeProjectSummary[]
}>()

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

function projectTo(slug: string) {
  return `/scrape/projects/${slug}`
}

function totalProjectCounts(projects: ScrapeProjectSummary[]) {
  return projects.reduce(
    (totals, project) => ({
      catalogItems: totals.catalogItems + project.counts.catalogItems,
      competitors: totals.competitors + project.counts.competitors,
      scrapeSeeds: totals.scrapeSeeds + project.counts.scrapeSeeds,
    }),
    { catalogItems: 0, competitors: 0, scrapeSeeds: 0 },
  )
}

const aggregateCounts = computed(() => totalProjectCounts(props.projects))
</script>

<template>
  <UCard class="max-w-6xl mx-auto border-default shadow-card">
    <template #header>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-semibold text-default">Catalog projects</h2>
            <UBadge color="primary" variant="soft"> {{ projects.length }} loaded </UBadge>
            <UIcon
              v-if="pending"
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-primary"
            />
          </div>

          <p class="max-w-3xl text-sm text-muted">
            Projects group the imported catalog with the competitor channels and seed URLs used to
            fill out that catalog over time.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UBadge color="neutral" variant="soft">
            {{ aggregateCounts.catalogItems.toLocaleString('en-US') }} catalog items
          </UBadge>
          <UBadge color="neutral" variant="soft">
            {{ aggregateCounts.competitors.toLocaleString('en-US') }} competitor links
          </UBadge>
          <UBadge color="neutral" variant="soft">
            {{ aggregateCounts.scrapeSeeds.toLocaleString('en-US') }} scrape seeds
          </UBadge>
        </div>
      </div>
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error.message || 'Could not load projects'"
      class="mb-4"
    />

    <div v-else-if="pending && projects.length === 0" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <div
      v-else-if="projects.length === 0"
      class="rounded-2xl border border-dashed border-default px-6 py-10 text-center"
    >
      <p class="text-sm text-muted">No projects are seeded yet.</p>
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-2">
      <UCard
        v-for="project in projects"
        :key="project.id"
        class="relative overflow-hidden border-default shadow-card"
      >
        <div class="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-primary via-info to-success" />

        <div class="flex flex-col gap-5">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="primary" variant="soft">
                {{ project.slug }}
              </UBadge>
              <UBadge v-if="project.customerName" color="neutral" variant="soft">
                {{ project.customerName }}
              </UBadge>
            </div>

            <div class="space-y-2">
              <h3 class="text-xl font-semibold text-default">{{ project.name }}</h3>
              <p v-if="project.description" class="text-sm leading-6 text-muted">
                {{ project.description }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-2xl border border-default bg-elevated/60 px-3 py-3">
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">Catalog</p>
              <p class="mt-2 text-xl font-semibold text-default tabular-nums">
                {{ project.counts.catalogItems.toLocaleString('en-US') }}
              </p>
            </div>
            <div class="rounded-2xl border border-default bg-elevated/60 px-3 py-3">
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">Channels</p>
              <p class="mt-2 text-xl font-semibold text-default tabular-nums">
                {{ project.counts.competitors.toLocaleString('en-US') }}
              </p>
            </div>
            <div class="rounded-2xl border border-default bg-elevated/60 px-3 py-3">
              <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">Seeds</p>
              <p class="mt-2 text-xl font-semibold text-default tabular-nums">
                {{ project.counts.scrapeSeeds.toLocaleString('en-US') }}
              </p>
            </div>
          </div>

          <div class="space-y-2 text-sm">
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
              <span class="text-muted">Updated</span>
              <span class="text-default">{{ formatDateTime(project.updatedAt) }}</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton :to="projectTo(project.slug)" icon="i-lucide-folder-kanban">
              View project
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UCard>
</template>
