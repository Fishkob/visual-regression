<template>
  <header
    class="w-full border-b border-border bg-background/60 backdrop-blur-sm py-3 px-4"
  >
    <div
      class="max-w-[1400px] mx-auto flex justify-between items-center"
      :data-testid="TEST_ID.header"
    >
      <RouterLink
        to="/"
        class="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
      >
        Visual Regression UI
      </RouterLink>

      <div class="flex items-center gap-3">
        <template v-if="user">
          <span
            class="text-sm text-muted-foreground"
            :data-testid="TEST_ID.currentUser"
          >
            {{ user.username }}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :data-testid="TEST_ID.logout"
            @click="logout"
          >
            Log out
          </Button>
        </template>
        <button
          type="button"
          class="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          @click="toggle"
          :aria-label="
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          "
          :data-testid="TEST_ID.themeToggle"
        >
          <Sun v-if="theme === 'dark'" class="w-4 h-4" />
          <Moon v-else class="w-4 h-4" />
        </button>
      </div>
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
import { useMeQuery, useLogout } from "@/composables/useAuth";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";
import { Sun, Moon } from "@lucide/vue";

const { theme, toggle } = useTheme();
const { data: user } = useMeQuery();
const { mutate: logout } = useLogout();
</script>
