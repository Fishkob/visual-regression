<template>
  <header
    class="w-full border-b border-border bg-background/60 backdrop-blur-sm py-3 px-4"
  >
    <div
      class="max-w-[1400px] mx-auto flex justify-between items-center"
      data-testid="header"
    >
      <RouterLink
        to="/"
        class="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
      >
        Visual Regression UI
      </RouterLink>

      <button
        type="button"
        class="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
        @click="toggle"
        :aria-label="
          theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        "
        data-testid="theme-toggle"
      >
        <Sun v-if="theme === 'dark'" class="w-4 h-4" />
        <Moon v-else class="w-4 h-4" />
      </button>
    </div>
  </header>

  <main class="p-6">
    <ErrorBoundary>
      <router-view />
    </ErrorBoundary>
  </main>

  <Toaster />
</template>

<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner";
import { RouterLink } from "vue-router";
import ErrorBoundary from "@/components/ErrorBoundary.vue";
import { useTheme } from "@/composables/useTheme";
import { Sun, Moon } from "@lucide/vue";

const { theme, toggle } = useTheme();
</script>
