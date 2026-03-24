<script setup lang="ts">
const config = useRuntimeConfig()
const appName = config.public.appName || 'Scrape'
const route = useRoute()
const { user, loggedIn } = useAuth()

useSeo({
  title: `${appName} — Project`,
  description:
    'Inspect a seeded catalog project, its imported items, competitor channels, and scrape seed targets.',
})
useWebPageSchema({
  name: `${appName} — Project`,
  description:
    'Inspect a seeded catalog project, its imported items, competitor channels, and scrape seed targets.',
})

const isAdmin = computed(() => user.value?.isAdmin === true)
const projectSlug = computed(() => {
  const raw = route.params.slug
  return Array.isArray(raw) ? (raw[0] ?? '') : String(raw ?? '')
})
const { project, projectError, projectPending, refreshProject } = useScrapeProject(projectSlug)
const { pending: runPending, runProject } = useScrapeProjectRun({
  onSuccess: async () => {
    await refreshProject()
  },
})

const backTo = computed(() => ({ path: '/scrape/projects' }))

async function onRunProject() {
  if (!project.value) {
    return
  }

  await runProject(project.value.slug)
}
</script>

<template>
  <UPage>
    <UPageSection>
      <UAlert
        v-if="!loggedIn"
        color="warning"
        variant="subtle"
        title="Sign in required"
        description="Log in as an admin to inspect seeded scrape projects."
        icon="i-lucide-lock"
        class="max-w-2xl mx-auto"
      />

      <UAlert
        v-else-if="!isAdmin"
        color="error"
        variant="subtle"
        title="Admin only"
        description="Your account does not have admin access to scrape projects."
        icon="i-lucide-shield-off"
        class="max-w-2xl mx-auto"
      />

      <template v-else>
        <div v-if="projectPending && !project" class="flex justify-center py-12">
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
        </div>

        <div v-else-if="project" class="max-w-6xl mx-auto">
          <ScrapeProjectDetail
            :back-to="backTo"
            :project="project"
            :run-pending="runPending"
            @refresh-project="() => refreshProject()"
            @run-project="onRunProject"
          />
        </div>

        <UCard v-else class="max-w-3xl mx-auto border-default shadow-card">
          <div class="space-y-4">
            <UAlert
              color="error"
              variant="subtle"
              title="Could not load project"
              :description="projectError?.message || 'Request failed'"
              icon="i-lucide-alert-circle"
            />

            <div class="flex flex-wrap gap-2">
              <UButton color="neutral" variant="subtle" icon="i-lucide-arrow-left" :to="backTo">
                Back to projects
              </UButton>
              <UButton icon="i-lucide-refresh-cw" variant="subtle" @click="() => refreshProject()">
                Retry
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UPageSection>
  </UPage>
</template>
