<script setup lang="ts">
const config = useRuntimeConfig()
const appName = config.public.appName || 'Scrape'
const { user, loggedIn } = useAuth()

useSeo({
  title: `${appName} — Projects`,
  description:
    'Browse seeded catalog projects, imported parts, competitor channels, and scrape seeds.',
})
useWebPageSchema({
  name: `${appName} — Projects`,
  description:
    'Browse seeded catalog projects, imported parts, competitor channels, and scrape seeds.',
})

const isAdmin = computed(() => user.value?.isAdmin === true)
const { projects, projectsError, projectsPending, refreshProjects } = useScrapeProjects()

const totals = computed(() =>
  projects.value.reduce(
    (aggregate, project) => ({
      catalogItems: aggregate.catalogItems + project.counts.catalogItems,
      competitors: aggregate.competitors + project.counts.competitors,
      scrapeSeeds: aggregate.scrapeSeeds + project.counts.scrapeSeeds,
    }),
    { catalogItems: 0, competitors: 0, scrapeSeeds: 0 },
  ),
)

const statItems = computed(() => [
  {
    label: 'Projects',
    value: projects.value.length.toLocaleString('en-US'),
    icon: 'i-lucide-folder-kanban',
  },
  {
    label: 'Catalog items',
    value: totals.value.catalogItems.toLocaleString('en-US'),
    icon: 'i-lucide-package-search',
  },
  {
    label: 'Channels',
    value: totals.value.competitors.toLocaleString('en-US'),
    icon: 'i-lucide-building-2',
  },
  {
    label: 'Seeds',
    value: totals.value.scrapeSeeds.toLocaleString('en-US'),
    icon: 'i-lucide-radar',
  },
])
</script>

<template>
  <UPage>
    <UPageHero
      title="Catalog projects"
      description="A simple project view for the catalog import seed bundle, competitor channels, and scrape target coverage."
      :ui="{ title: 'text-4xl sm:text-5xl', description: 'text-lg text-muted' }"
    >
      <template #links>
        <div class="flex flex-wrap justify-center gap-2">
          <UButton to="/scrape" color="neutral" variant="subtle" icon="i-lucide-arrow-left">
            Scrape ops
          </UButton>

          <UButton
            v-if="loggedIn && isAdmin"
            icon="i-lucide-refresh-cw"
            variant="subtle"
            @click="() => refreshProjects()"
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
        description="Log in as an admin to browse seeded scrape projects."
        icon="i-lucide-lock"
        class="mx-auto max-w-2xl"
      />

      <UAlert
        v-else-if="!isAdmin"
        color="error"
        variant="subtle"
        title="Admin only"
        description="Your account does not have admin access to scrape projects."
        icon="i-lucide-shield-off"
        class="mx-auto max-w-2xl"
      />

      <template v-else>
        <div class="mx-auto mb-8 grid max-w-6xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard v-for="item in statItems" :key="item.label" class="border-default shadow-card">
            <div class="flex items-center justify-between gap-3">
              <div class="space-y-1">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  {{ item.label }}
                </p>
                <p class="text-2xl font-semibold text-default tabular-nums">{{ item.value }}</p>
              </div>

              <div
                class="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              >
                <UIcon :name="item.icon" class="size-5" />
              </div>
            </div>
          </UCard>
        </div>

        <ScrapeProjectsCard
          :projects="projects"
          :pending="projectsPending"
          :error="projectsError"
        />
      </template>
    </UPageSection>
  </UPage>
</template>
