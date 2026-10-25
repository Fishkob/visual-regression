<template>
  <div
    class="min-h-screen"
    :class="{ 'md:flex': !isBare }"
    :data-testid="TEST_ID.appShell"
  >
    <AppSidebar v-if="!isBare && routeReady" />
    <div class="flex min-w-0 flex-col" :class="{ 'flex-1': !isBare }">
      <AppHeader v-if="!isBare && routeReady" />
      <main class="p-4 md:p-6" :class="{ 'flex-1': !isBare }">
        <ErrorBoundary>
          <RouterView />
        </ErrorBoundary>
      </main>
    </div>
    <GlobalSearchPalette v-if="!isBare && routeReady" />
  </div>
  <Toaster position="top-right" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import AppSidebar from "@/components/AppSidebar.vue";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import GlobalSearchPalette from "@/components/search/GlobalSearchPalette.vue";
import { Toaster } from "@/components/ui/sonner";
import { TEST_ID } from "@/lib/test-ids";

// Login and the forced password change are pre-shell pages: there is nothing to
// navigate to yet, and a header full of admin-only links would be noise.
const BARE_ROUTES = new Set(["login", "change-password"]);

const route = useRoute();
const isBare = computed(() => BARE_ROUTES.has(String(route.name)));
const routeReady = computed(() => route.matched.length > 0);
</script>
