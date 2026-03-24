<script setup lang="ts">
const config = useRuntimeConfig()
const appName = config.public.appName || 'Scrape'
const route = useRoute()
const { user, loggedIn } = useAuth()

useSeo({
  title: `${appName} — Observation`,
  description: 'Inspect a single scrape observation payload, metadata, and run provenance.',
})
useWebPageSchema({
  name: `${appName} — Observation`,
  description: 'Inspect a single scrape observation payload, metadata, and run provenance.',
})

const isAdmin = computed(() => user.value?.isAdmin === true)
const observationId = computed(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : String(raw ?? '')
})
const { observation, observationError, observationPending, refreshObservation } =
  useScrapeObservation(observationId)

function parsePageQuery(value: string | null | Array<string | null> | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

const returnPage = computed(() => parsePageQuery(route.query.page))
const backTo = computed(() => {
  return returnPage.value > 1
    ? { path: '/scrape', query: { page: String(returnPage.value) } }
    : { path: '/scrape' }
})
</script>

<template>
  <UPage>
    <UPageSection>
      <UAlert
        v-if="!loggedIn"
        color="warning"
        variant="subtle"
        title="Sign in required"
        description="Log in as an admin to inspect individual observations."
        icon="i-lucide-lock"
        class="max-w-2xl mx-auto"
      />

      <UAlert
        v-else-if="!isAdmin"
        color="error"
        variant="subtle"
        title="Admin only"
        description="Your account does not have admin access to scrape observations."
        icon="i-lucide-shield-off"
        class="max-w-2xl mx-auto"
      />

      <template v-else>
        <div v-if="observationPending && !observation" class="flex justify-center py-12">
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
        </div>

        <div v-else-if="observation" class="max-w-6xl mx-auto">
          <ScrapeObservationDetail :back-to="backTo" :observation="observation" />
        </div>

        <UCard v-else class="max-w-3xl mx-auto border-default shadow-card">
          <div class="space-y-4">
            <UAlert
              color="error"
              variant="subtle"
              title="Could not load observation"
              :description="observationError?.message || 'Request failed'"
              icon="i-lucide-alert-circle"
            />

            <div class="flex flex-wrap gap-2">
              <UButton color="neutral" variant="subtle" icon="i-lucide-arrow-left" :to="backTo">
                Back to list
              </UButton>
              <UButton
                icon="i-lucide-refresh-cw"
                variant="subtle"
                @click="() => refreshObservation()"
              >
                Retry
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UPageSection>
  </UPage>
</template>
