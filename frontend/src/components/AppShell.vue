<template>
  <div
    class="min-h-screen"
    :class="{ 'md:flex': !isBare }"
    :data-testid="TEST_ID.appShell"
  >
    <a
      v-if="!isBare"
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      :data-testid="TEST_ID.skipToContent"
    >
      {{ t("common.skipToContent") }}
    </a>
    <AppSidebar v-if="!isBare && routeReady && !isFullscreen" />
    <div class="flex min-w-0 flex-col" :class="{ 'flex-1': !isBare }">
      <AppHeader v-if="!isBare && routeReady && !isFullscreen" />
      <main id="main-content" tabindex="-1" :class="mainClass">
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
import { useI18n } from "vue-i18n";
import AppHeader from "@/components/AppHeader.vue";
import AppSidebar from "@/components/AppSidebar.vue";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import GlobalSearchPalette from "@/components/search/GlobalSearchPalette.vue";
import { Toaster } from "@/components/ui/sonner";
import { useFullscreen } from "@/composables/useFullscreen";
import { cn } from "@/lib/utils";
import { TEST_ID } from "@/lib/test-ids";

// Login and the forced password change are pre-shell pages: there is nothing to
// navigate to yet, and a header full of admin-only links would be noise.
const BARE_ROUTES = new Set(["login", "change-password", "share"]);

const route = useRoute();
const { t } = useI18n();
const isBare = computed(() => BARE_ROUTES.has(String(route.name)));
const routeReady = computed(() => route.matched.length > 0);

// A page that asks for the whole window (the test overview) owns the mode and
// gives it back on unmount; the shell only gets out of the way. The padding
// rides along, because a two-rem frame around a screen-sized comparison is
// exactly the room the mode just won.
const { isFullscreen } = useFullscreen();
const mainClass = computed(() =>
  cn({
    "flex-1": !isBare.value,
    "p-4 md:p-6": !isFullscreen.value,
    "p-2": isFullscreen.value,
  }),
);
</script>
