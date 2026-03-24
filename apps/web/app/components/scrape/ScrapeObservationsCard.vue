<script setup lang="ts">
import type { ScrapeObservationRow } from '../../composables/useScrapeObservation'

interface ErrorLike {
  message?: string
}

const props = defineProps<{
  error: ErrorLike | null | undefined
  limit: number
  observations: ScrapeObservationRow[]
  page: number
  pending: boolean
  total: number
}>()

const emit = defineEmits<{
  'update:page': [value: number]
}>()

const columns = [
  { accessorKey: 'observedAt', header: 'Observed' },
  { accessorKey: 'sourceKey', header: 'Source' },
  { accessorKey: 'normalizedUrl', header: 'Observation' },
  { id: 'signals', header: 'Signals' },
  { accessorKey: 'qualityScore', header: 'Quality' },
  { id: 'actions', header: '' },
]

const totalLabel = computed(() => {
  if (props.total === 0) {
    return 'No observations captured yet'
  }

  return `${props.total} total`
})

const canGoBackward = computed(() => props.page > 1)
const canGoForward = computed(() => props.page * props.limit < props.total)

const pageQuery = computed(() => (props.page > 1 ? { page: String(props.page) } : undefined))

function observationTo(id: string) {
  return pageQuery.value
    ? { path: `/scrape/observations/${id}`, query: pageQuery.value }
    : { path: `/scrape/observations/${id}` }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function formatObservedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function qualityColor(score: number | null) {
  if (score === null) {
    return 'neutral'
  }

  if (score >= 85) {
    return 'success'
  }

  if (score >= 60) {
    return 'primary'
  }

  if (score >= 40) {
    return 'warning'
  }

  return 'neutral'
}

function qualityLabel(score: number | null): string {
  return score === null ? 'Unscored' : `${score}/100`
}

function observationHeadline(observation: ScrapeObservationRow): string {
  return (
    readString(observation.payload.title) ??
    readString(observation.payload.ogTitle) ??
    readString(observation.payload.finalUrl) ??
    observation.normalizedUrl
  )
}

function observationSummary(observation: ScrapeObservationRow): string | null {
  return (
    readString(observation.payload.metaDescription) ??
    readString(observation.payload.ogPrice) ??
    readString(observation.payload.finalUrl)
  )
}

function observationSignals(observation: ScrapeObservationRow): string[] {
  const prices = readStringArray(observation.payload.prices)
  const httpStatus = readNumber(observation.payload.httpStatus)
  const contentLength = readNumber(observation.payload.contentLength)
  const signals = [
    httpStatus === null ? null : `HTTP ${httpStatus}`,
    prices.length > 0 ? `${prices.length} price signal${prices.length === 1 ? '' : 's'}` : null,
    contentLength === null ? null : `${contentLength.toLocaleString('en-US')} chars`,
  ]

  return signals.filter((signal): signal is string => signal !== null)
}

function nextPage() {
  if (canGoForward.value) {
    emit('update:page', props.page + 1)
  }
}

function previousPage() {
  if (canGoBackward.value) {
    emit('update:page', props.page - 1)
  }
}
</script>

<template>
  <UCard class="max-w-6xl mx-auto border-default shadow-card">
    <template #header>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-semibold text-default">Latest observations</h2>
            <UBadge color="neutral" variant="soft">
              {{ totalLabel }}
            </UBadge>
            <UIcon
              v-if="pending"
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-primary"
            />
          </div>

          <p class="max-w-2xl text-sm text-muted">
            Each observation now opens as its own page, so you can inspect the payload, target
            metadata, and scrape run provenance without decoding a single table cell.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-chevron-left"
            size="sm"
            variant="ghost"
            :disabled="!canGoBackward"
            @click="previousPage"
          />
          <span class="min-w-[7ch] text-center text-sm text-muted tabular-nums"
            >Page {{ page }}</span
          >
          <UButton
            icon="i-lucide-chevron-right"
            size="sm"
            variant="ghost"
            :disabled="!canGoForward"
            @click="nextPage"
          />
        </div>
      </div>
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error.message || 'Could not load observations'"
      class="mb-4"
    />

    <div v-else-if="pending && observations.length === 0" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
    </div>

    <template v-else-if="observations.length > 0">
      <div class="space-y-3 md:hidden">
        <UCard
          v-for="observation in observations"
          :key="observation.id"
          class="border-default shadow-card"
        >
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="neutral" variant="soft">
                {{ observation.sourceKey }}
              </UBadge>
              <UBadge :color="qualityColor(observation.qualityScore)" variant="soft">
                {{ qualityLabel(observation.qualityScore) }}
              </UBadge>
              <span class="text-xs text-muted">{{ formatObservedAt(observation.observedAt) }}</span>
            </div>

            <div class="space-y-2">
              <ULink
                :to="observationTo(observation.id)"
                class="font-medium text-default transition-colors hover:text-primary break-words"
              >
                {{ observationHeadline(observation) }}
              </ULink>

              <p class="font-mono text-xs text-dimmed break-all">{{ observation.normalizedUrl }}</p>

              <p v-if="observationSummary(observation)" class="text-sm text-muted">
                {{ observationSummary(observation) }}
              </p>

              <div v-if="observationSignals(observation).length > 0" class="flex flex-wrap gap-2">
                <UBadge
                  v-for="signal in observationSignals(observation)"
                  :key="signal"
                  color="neutral"
                  variant="outline"
                  size="sm"
                >
                  {{ signal }}
                </UBadge>
              </div>
            </div>

            <div class="flex justify-end">
              <UButton
                :to="observationTo(observation.id)"
                icon="i-lucide-arrow-right"
                trailing
                size="sm"
              >
                View observation
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <UTable
        :data="observations"
        :columns="columns"
        class="hidden md:block w-full min-w-0"
        :ui="{ th: 'text-left', td: 'align-top' }"
      >
        <template #observedAt-cell="{ row }">
          <div class="space-y-1">
            <p class="text-sm font-medium text-default">
              {{ formatObservedAt(row.original.observedAt) }}
            </p>
            <p class="font-mono text-xs text-dimmed">
              {{ row.original.id.slice(0, 8) }}…{{ row.original.contentHash.slice(0, 6) }}
            </p>
          </div>
        </template>

        <template #sourceKey-cell="{ row }">
          <UBadge color="neutral" variant="soft">
            {{ row.original.sourceKey }}
          </UBadge>
        </template>

        <template #normalizedUrl-cell="{ row }">
          <div class="space-y-1 min-w-0">
            <ULink
              :to="observationTo(row.original.id)"
              class="line-clamp-2 font-medium text-default transition-colors hover:text-primary"
            >
              {{ observationHeadline(row.original) }}
            </ULink>
            <p class="font-mono text-xs text-dimmed break-all">
              {{ row.original.normalizedUrl }}
            </p>
          </div>
        </template>

        <template #signals-cell="{ row }">
          <div class="space-y-2">
            <p v-if="observationSummary(row.original)" class="line-clamp-2 text-sm text-muted">
              {{ observationSummary(row.original) }}
            </p>
            <div v-if="observationSignals(row.original).length > 0" class="flex flex-wrap gap-2">
              <UBadge
                v-for="signal in observationSignals(row.original)"
                :key="signal"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ signal }}
              </UBadge>
            </div>
          </div>
        </template>

        <template #qualityScore-cell="{ row }">
          <UBadge :color="qualityColor(row.original.qualityScore)" variant="soft">
            {{ qualityLabel(row.original.qualityScore) }}
          </UBadge>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              :to="observationTo(row.original.id)"
              variant="subtle"
              size="sm"
              icon="i-lucide-arrow-right"
              trailing
            >
              View
            </UButton>
          </div>
        </template>
      </UTable>
    </template>

    <p v-else class="text-sm text-muted">
      No observations yet. Use <strong>Queue a scrape</strong> above, then run an agent against
      <code class="font-mono text-xs">/api/scrape/agent/work</code>
      and
      <code class="font-mono text-xs">/api/scrape/agent/ingest</code>
      .
    </p>

    <p v-if="observations.length > 0" class="mt-4 text-xs text-muted">
      Showing {{ observations.length }} of {{ limit }} per page.
    </p>
  </UCard>
</template>
