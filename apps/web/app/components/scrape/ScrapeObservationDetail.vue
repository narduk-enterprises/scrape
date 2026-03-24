<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { ScrapeObservationDetail } from '../../composables/useScrapeObservation'

interface DetailFact {
  label: string
  value: string
  icon: string
}

const props = defineProps<{
  backTo: RouteLocationRaw
  observation: ScrapeObservationDetail
}>()

const breadcrumbs = computed(() => [
  {
    label: 'Scrape ops',
    icon: 'i-lucide-binoculars',
    to: props.backTo,
  },
  {
    label: 'Observation',
    icon: 'i-lucide-file-search',
  },
])

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

function formatNumber(value: number | null): string | null {
  return value === null ? null : value.toLocaleString('en-US')
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return 'Unable to render JSON'
  }
}

function getHostname(value: string): string | null {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
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

const payloadTitle = computed(() => readString(props.observation.payload.title))
const ogTitle = computed(() => readString(props.observation.payload.ogTitle))
const metaDescription = computed(() => readString(props.observation.payload.metaDescription))
const finalUrl = computed(() => readString(props.observation.payload.finalUrl))
const ogPrice = computed(() => readString(props.observation.payload.ogPrice))
const ogCurrency = computed(() => readString(props.observation.payload.ogCurrency))
const priceSignals = computed(() => readStringArray(props.observation.payload.prices))
const httpStatus = computed(() => readNumber(props.observation.payload.httpStatus))
const contentLength = computed(() => readNumber(props.observation.payload.contentLength))
const observationTitle = computed(
  () =>
    payloadTitle.value ??
    ogTitle.value ??
    props.observation.targetLabel ??
    props.observation.normalizedUrl,
)
const observationSubtitle = computed(
  () =>
    metaDescription.value ??
    'Full payload, target metadata, and scrape run telemetry for a single captured observation.',
)
const domainLabel = computed(() => getHostname(props.observation.normalizedUrl))
const targetMetaJson = computed(() =>
  props.observation.targetMeta ? formatJson(props.observation.targetMeta) : null,
)
const runMetaJson = computed(() =>
  props.observation.runMeta ? formatJson(props.observation.runMeta) : null,
)
const payloadJson = computed(() => formatJson(props.observation.payload))

const topFacts = computed<DetailFact[]>(() =>
  [
    {
      label: 'Observed',
      value: formatDateTime(props.observation.observedAt),
      icon: 'i-lucide-clock-3',
    },
    {
      label: 'Source',
      value: props.observation.sourceLabel ?? props.observation.sourceKey,
      icon: 'i-lucide-database',
    },
    {
      label: 'Run status',
      value: props.observation.runStatus,
      icon: 'i-lucide-activity',
    },
    {
      label: 'Agent',
      value: props.observation.agentHostname ?? props.observation.agentId ?? 'Not recorded',
      icon: 'i-lucide-cpu',
    },
  ].filter((fact) => fact.value.length > 0),
)

const provenanceFacts = computed<DetailFact[]>(() =>
  [
    {
      label: 'Normalized URL',
      value: props.observation.normalizedUrl,
      icon: 'i-lucide-link',
    },
    {
      label: 'Target label',
      value: props.observation.targetLabel ?? 'Not set',
      icon: 'i-lucide-tag',
    },
    {
      label: 'External key',
      value: props.observation.targetExternalKey ?? 'Not set',
      icon: 'i-lucide-key-round',
    },
    {
      label: 'Source TTL',
      value: `${props.observation.sourceDefaultTtlSeconds.toLocaleString('en-US')} seconds`,
      icon: 'i-lucide-timer',
    },
    {
      label: 'Run started',
      value: formatDateTime(props.observation.runStartedAt),
      icon: 'i-lucide-play',
    },
    {
      label: 'Run finished',
      value: props.observation.runFinishedAt
        ? formatDateTime(props.observation.runFinishedAt)
        : 'Still open',
      icon: 'i-lucide-flag',
    },
  ].filter((fact) => fact.value.length > 0),
)

const telemetryFacts = computed<DetailFact[]>(() => [
  {
    label: 'HTTP status',
    value: httpStatus.value === null ? 'Unavailable' : String(httpStatus.value),
    icon: 'i-lucide-globe',
  },
  {
    label: 'Content length',
    value: formatNumber(contentLength.value) ?? 'Unavailable',
    icon: 'i-lucide-file-digit',
  },
  {
    label: 'Run type',
    value: props.observation.runType ?? 'Unspecified',
    icon: 'i-lucide-radar',
  },
  {
    label: 'Connector',
    value: props.observation.runConnectorKey ?? 'Default',
    icon: 'i-lucide-plug-zap',
  },
  {
    label: 'Created',
    value: formatDateTime(props.observation.createdAt),
    icon: 'i-lucide-history',
  },
  {
    label: 'Updated target',
    value: formatDateTime(props.observation.targetUpdatedAt),
    icon: 'i-lucide-refresh-cw',
  },
])

const runCountFacts = computed<DetailFact[]>(() => [
  {
    label: 'Records created',
    value: formatNumber(props.observation.runRecordsCreated) ?? '0',
    icon: 'i-lucide-plus-circle',
  },
  {
    label: 'Records updated',
    value: formatNumber(props.observation.runRecordsUpdated) ?? '0',
    icon: 'i-lucide-pencil-line',
  },
  {
    label: 'Records skipped',
    value: formatNumber(props.observation.runRecordsSkipped) ?? '0',
    icon: 'i-lucide-forward',
  },
  {
    label: 'Parse errors',
    value: formatNumber(props.observation.runParseErrorCount) ?? '0',
    icon: 'i-lucide-triangle-alert',
  },
])

const traceFacts = computed<DetailFact[]>(() => [
  {
    label: 'Observation ID',
    value: props.observation.id,
    icon: 'i-lucide-fingerprint',
  },
  {
    label: 'Content hash',
    value: props.observation.contentHash,
    icon: 'i-lucide-hash',
  },
  {
    label: 'Target ID',
    value: props.observation.targetId,
    icon: 'i-lucide-crosshair',
  },
  {
    label: 'Run ID',
    value: props.observation.runId,
    icon: 'i-lucide-workflow',
  },
])

const artifactLink = computed(() => readString(props.observation.artifactRef))
const titleSignal = computed(() => payloadTitle.value ?? 'No page title extracted')
const alternateTitle = computed(() => ogTitle.value)
const priceLead = computed(() => {
  if (!ogPrice.value) {
    return null
  }

  return [ogPrice.value, ogCurrency.value]
    .filter((value): value is string => value !== null)
    .join(' ')
})
</script>

<template>
  <div class="space-y-6">
    <UBreadcrumb :items="breadcrumbs" />

    <section
      class="relative overflow-hidden rounded-[1.75rem] border border-default bg-linear-to-br from-primary/10 via-default to-default px-6 py-6 shadow-card sm:px-8"
    >
      <div class="absolute -right-10 top-0 size-40 rounded-full bg-primary/15 blur-3xl" />
      <div class="absolute bottom-0 left-0 size-56 rounded-full bg-info/10 blur-3xl" />

      <div class="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-5 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="soft">
              {{ observation.sourceKey }}
            </UBadge>
            <UBadge :color="qualityColor(observation.qualityScore)" variant="soft">
              {{
                observation.qualityScore === null
                  ? 'Unscored'
                  : `${observation.qualityScore}/100 quality`
              }}
            </UBadge>
            <UBadge v-if="observation.strategy" color="primary" variant="soft">
              {{ observation.strategy }}
            </UBadge>
          </div>

          <div class="space-y-3">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
              Observation dossier
            </p>
            <h1 class="font-display text-3xl text-balance text-default sm:text-4xl lg:text-5xl">
              {{ observationTitle }}
            </h1>
            <p class="max-w-3xl text-sm text-muted sm:text-base">
              {{ observationSubtitle }}
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <div
              v-if="domainLabel"
              class="flex items-center gap-2 rounded-full border border-default bg-default/75 px-3 py-1.5 text-sm text-muted"
            >
              <UIcon name="i-lucide-globe" class="size-4 text-primary" />
              <span>{{ domainLabel }}</span>
            </div>

            <div
              class="flex items-center gap-2 rounded-full border border-default bg-default/75 px-3 py-1.5 text-sm text-muted"
            >
              <UIcon name="i-lucide-calendar-range" class="size-4 text-primary" />
              <span>{{ formatDateTime(observation.observedAt) }}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="subtle" icon="i-lucide-arrow-left" :to="backTo">
            Back to list
          </UButton>
          <UButton
            icon="i-lucide-arrow-up-right"
            :to="observation.normalizedUrl"
            target="_blank"
            external
          >
            Open target
          </UButton>
        </div>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
      <div class="space-y-6">
        <UCard class="border-default shadow-card">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-default">Observation snapshot</h2>
              <p class="text-sm text-muted">
                Primary extracted fields from the observation payload, with quick links for
                drilldown.
              </p>
            </div>
          </template>

          <div class="space-y-6">
            <div class="grid gap-3 sm:grid-cols-2">
              <div
                v-for="fact in topFacts"
                :key="fact.label"
                class="rounded-2xl border border-default bg-elevated/60 p-4"
              >
                <div
                  class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
                >
                  <UIcon :name="fact.icon" class="size-4 text-primary" />
                  <span>{{ fact.label }}</span>
                </div>
                <p class="text-sm font-medium text-default break-words">{{ fact.value }}</p>
              </div>
            </div>

            <USeparator />

            <div class="grid gap-4 lg:grid-cols-2">
              <div class="space-y-2 rounded-2xl border border-default bg-elevated/60 p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  Title signal
                </p>
                <p class="text-base font-medium text-default">{{ titleSignal }}</p>
                <p v-if="alternateTitle" class="text-sm text-muted">
                  Open Graph title: {{ alternateTitle }}
                </p>
              </div>

              <div class="space-y-2 rounded-2xl border border-default bg-elevated/60 p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  Description signal
                </p>
                <p class="text-sm text-default">
                  {{ metaDescription ?? 'No meta description extracted from this capture.' }}
                </p>
              </div>

              <div class="space-y-2 rounded-2xl border border-default bg-elevated/60 p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  Resolved URL
                </p>
                <ULink
                  :to="finalUrl ?? observation.normalizedUrl"
                  target="_blank"
                  external
                  class="break-all text-sm text-default transition-colors hover:text-primary"
                >
                  {{ finalUrl ?? observation.normalizedUrl }}
                </ULink>
              </div>

              <div class="space-y-2 rounded-2xl border border-default bg-elevated/60 p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  Price signals
                </p>
                <p v-if="priceLead" class="text-sm font-medium text-default">
                  {{ priceLead }}
                </p>
                <div v-if="priceSignals.length > 0" class="flex flex-wrap gap-2">
                  <UBadge v-for="price in priceSignals" :key="price" color="primary" variant="soft">
                    {{ price }}
                  </UBadge>
                </div>
                <p v-else-if="!priceLead" class="text-sm text-muted">
                  No price strings were captured in this payload.
                </p>
              </div>
            </div>
          </div>
        </UCard>

        <UCard class="border-default shadow-card">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-default">Raw payload</h2>
              <p class="text-sm text-muted">
                Exact JSON stored for this observation after deduplication.
              </p>
            </div>
          </template>

          <div class="overflow-x-auto rounded-2xl border border-default bg-elevated/60 p-4">
            <pre class="font-mono text-xs leading-6 text-default whitespace-pre-wrap break-words">{{
              payloadJson
            }}</pre>
          </div>
        </UCard>
      </div>

      <div class="space-y-6">
        <UCard class="border-default shadow-card">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-default">Provenance</h2>
              <p class="text-sm text-muted">
                Where the observation came from and how it moved through the scrape pipeline.
              </p>
            </div>
          </template>

          <div class="space-y-4">
            <div
              v-for="fact in provenanceFacts"
              :key="fact.label"
              class="rounded-2xl border border-default bg-elevated/60 p-4"
            >
              <div
                class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
              >
                <UIcon :name="fact.icon" class="size-4 text-primary" />
                <span>{{ fact.label }}</span>
              </div>
              <p class="text-sm text-default break-words">{{ fact.value }}</p>
            </div>

            <div v-if="artifactLink" class="rounded-2xl border border-default bg-elevated/60 p-4">
              <div
                class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
              >
                <UIcon name="i-lucide-paperclip" class="size-4 text-primary" />
                <span>Artifact reference</span>
              </div>
              <ULink
                :to="artifactLink"
                target="_blank"
                external
                class="break-all text-sm text-default transition-colors hover:text-primary"
              >
                {{ artifactLink }}
              </ULink>
            </div>
          </div>
        </UCard>

        <UCard class="border-default shadow-card">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-default">Telemetry</h2>
              <p class="text-sm text-muted">
                Request signals and run counters recorded alongside the payload.
              </p>
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <div
                v-for="fact in telemetryFacts"
                :key="fact.label"
                class="rounded-2xl border border-default bg-elevated/60 p-4"
              >
                <div
                  class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
                >
                  <UIcon :name="fact.icon" class="size-4 text-primary" />
                  <span>{{ fact.label }}</span>
                </div>
                <p class="text-sm text-default break-words">{{ fact.value }}</p>
              </div>
            </div>

            <USeparator />

            <div class="grid gap-3 sm:grid-cols-2">
              <div
                v-for="fact in runCountFacts"
                :key="fact.label"
                class="rounded-2xl border border-default bg-elevated/60 p-4"
              >
                <div
                  class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
                >
                  <UIcon :name="fact.icon" class="size-4 text-primary" />
                  <span>{{ fact.label }}</span>
                </div>
                <p class="text-sm text-default">{{ fact.value }}</p>
              </div>
            </div>
          </div>
        </UCard>

        <UCard class="border-default shadow-card">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-default">Trace identifiers</h2>
              <p class="text-sm text-muted">
                Stable ids and hashes for cross-referencing this capture with runs, targets, and
                downstream storage.
              </p>
            </div>
          </template>

          <div class="space-y-4">
            <div
              v-for="fact in traceFacts"
              :key="fact.label"
              class="rounded-2xl border border-default bg-elevated/60 p-4"
            >
              <div
                class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted"
              >
                <UIcon :name="fact.icon" class="size-4 text-primary" />
                <span>{{ fact.label }}</span>
              </div>
              <p class="font-mono text-xs text-default break-all">{{ fact.value }}</p>
            </div>
          </div>
        </UCard>

        <UCard v-if="targetMetaJson" class="border-default shadow-card">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-default">Target metadata</h2>
              <p class="text-sm text-muted">Metadata stored on the deduplicated target record.</p>
            </div>
          </template>

          <div class="overflow-x-auto rounded-2xl border border-default bg-elevated/60 p-4">
            <pre class="font-mono text-xs leading-6 text-default whitespace-pre-wrap break-words">{{
              targetMetaJson
            }}</pre>
          </div>
        </UCard>

        <UCard v-if="runMetaJson" class="border-default shadow-card">
          <template #header>
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-default">Run metadata</h2>
              <p class="text-sm text-muted">
                Additional structured metadata attached to the ingest run.
              </p>
            </div>
          </template>

          <div class="overflow-x-auto rounded-2xl border border-default bg-elevated/60 p-4">
            <pre class="font-mono text-xs leading-6 text-default whitespace-pre-wrap break-words">{{
              runMetaJson
            }}</pre>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
