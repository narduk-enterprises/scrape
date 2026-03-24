<script setup lang="ts">
const route = useRoute()
const appName = useRuntimeConfig().public.appName || 'Scrape'

const navItems = [
  { label: 'Scrape ops', to: '/scrape', icon: 'i-lucide-binoculars' },
  { label: 'Projects', to: '/scrape/projects', icon: 'i-lucide-folder-kanban' },
]
</script>

<template>
  <LayerAppShell>
    <template #header>
      <LayerAppHeader :app-name="appName" :nav-links="navItems" />
    </template>

    <div
      :class="[
        'flex-1 w-full min-w-0',
        route.meta.layout === 'landing' ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8',
      ]"
    >
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>

    <template #footer>
      <LayerAppFooter :app-name="appName" />
    </template>
  </LayerAppShell>
</template>
