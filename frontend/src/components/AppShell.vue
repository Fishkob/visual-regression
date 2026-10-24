<template>
  <div
    class="min-h-screen"
    :class="{ 'md:flex': !isLogin }"
    :data-testid="TEST_ID.appShell"
  >
    <AppSidebar v-if="!isLogin && routeReady" />
    <div class="flex min-w-0 flex-col" :class="{ 'flex-1': !isLogin }">
      <AppHeader v-if="!isLogin && routeReady" />
      <main class="p-4 md:p-6" :class="{ 'flex-1': !isLogin }">
        <ErrorBoundary>
          <RouterView />
        </ErrorBoundary>
      </main>
    </div>
  </div>
  <Toaster position="top-right" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import AppSidebar from "@/components/AppSidebar.vue";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import { Toaster } from "@/components/ui/sonner";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const isLogin = computed(() => route.name === "login");
const routeReady = computed(() => route.matched.length > 0);
</script>
