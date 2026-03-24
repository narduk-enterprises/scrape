<script setup lang="ts">
const config = useRuntimeConfig()
const appName = config.public.appName || 'Scrape'
const { user, loggedIn } = useAuth()

useSeo({
  title: `${appName} — Scrape ops`,
  description: 'Targets, observations, and agent queue health.',
})
useWebPageSchema({
  name: `${appName} — Scrape ops`,
  description: 'Targets, observations, and agent queue health.',
})

const page = ref(1)
const limit = 15

const {
  summary,
  summaryError,
  summaryPending,
  refreshSummary,
  obsPage,
  obsError,
  obsPending,
  refreshObs,
  obsColumns,
} = useScrapeDashboard(page, limit)

const isAdmin = computed(() => user.value?.isAdmin === true)

const statItems = computed(() => {
  const c = summary.value?.counts
  if (!c) return []
  return [
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
            v-if="loggedIn && isAdmin"
            icon="i-lucide-refresh-cw"
            variant="subtle"
            @click="() => { refreshSummary(); refreshObs() }"
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
        <UAlert
          v-if="summaryError"
          color="error"
          variant="subtle"
          title="Could not load summary"
          :description="summaryError.message || 'Request failed'"
          icon="i-lucide-alert-circle"
          class="max-w-2xl mx-auto mb-6"
        />

        <div
          v-else-if="summaryPending && !summary"
          class="flex justify-center py-12"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-8 animate-spin text-primary"
          />
        </div>

        <template v-else>
          <div
            class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 max-w-6xl mx-auto mb-10"
          >
            <UCard
              v-for="s in statItems"
              :key="s.label"
              variant="subtle"
              class="text-center"
            >
              <UIcon
                :name="s.icon"
                class="size-6 text-primary mx-auto mb-2"
              />
              <p class="text-2xl font-semibold tabular-nums">{{ s.value }}</p>
              <p class="text-xs text-muted">{{ s.label }}</p>
            </UCard>
          </div>

          <UCard class="max-w-6xl mx-auto">
            <template #header>
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 class="text-lg font-semibold">Latest observations</h2>
                <div class="flex items-center gap-2">
                  <UButton
                    icon="i-lucide-chevron-left"
                    size="sm"
                    variant="ghost"
                    :disabled="page <= 1"
                    @click="page = Math.max(1, page - 1)"
                  />
                  <span class="text-sm text-muted tabular-nums">Page {{ page }}</span>
                  <UButton
                    icon="i-lucide-chevron-right"
                    size="sm"
                    variant="ghost"
                    :disabled="!obsPage || page * limit >= obsPage.total"
                    @click="page += 1"
                  />
                </div>
              </div>
            </template>

            <UAlert
              v-if="obsError"
              color="error"
              variant="subtle"
              :title="obsError.message"
              class="mb-4"
            />

            <div
              v-else-if="obsPending && !obsPage"
              class="flex justify-center py-8"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-6 animate-spin text-primary"
              />
            </div>

            <UTable
              v-else-if="obsPage?.observations?.length"
              :data="obsPage.observations"
              :columns="obsColumns"
              class="w-full min-w-0"
              :ui="{ th: 'text-left', td: 'align-top' }"
            />

            <p
              v-else
              class="text-muted text-sm"
            >
              No observations yet. Enqueue targets via
              <code class="font-mono text-xs">POST /api/scrape/admin/targets</code>
              , then run a local agent against
              <code class="font-mono text-xs">/api/scrape/agent/work</code>
              and
              <code class="font-mono text-xs">/api/scrape/agent/ingest</code>
              .
            </p>

            <p
              v-if="obsPage?.observations?.length"
              class="text-xs text-muted mt-3"
            >
              {{ obsPage.total }} total · showing {{ obsPage.observations.length }} of
              {{ limit }} per page
            </p>
          </UCard>
        </template>
      </template>
    </UPageSection>
  </UPage>
</template>
