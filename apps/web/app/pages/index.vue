<script setup lang="ts">
const config = useRuntimeConfig()
const appName = config.public.appName || 'Scrape'

useSeo({
  title: `${appName} — Sign in`,
  description: `Sign in to access ${appName} scrape operations.`,
})
useWebPageSchema({
  name: `${appName} — Sign in`,
  description: `Sign in to access ${appName} scrape operations.`,
})
definePageMeta({ middleware: ['guest'] })
</script>

<template>
  <div class="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
    <AuthLoginCard
      :title="`Welcome to ${appName}`"
      subtitle="Sign in to open scrape operations"
      redirect-path="/scrape"
    />
  </div>
</template>
