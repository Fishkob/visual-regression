<script setup lang="ts">
import { Moon, Sun, LogOut } from "@lucide/vue";
import { useTheme } from "@/composables/useTheme";
import { useMeQuery, useLogout } from "@/composables/useAuth";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";

const { theme, toggle } = useTheme();
const { data: user } = useMeQuery();
const { mutate: logout } = useLogout();
</script>

<template>
  <header
    class="flex items-center justify-end gap-2 border-b bg-card/40 px-4 py-2"
    :data-testid="TEST_ID.appHeader"
  >
    <span
      v-if="user"
      class="truncate text-sm text-muted-foreground"
      :data-testid="TEST_ID.currentUser"
    >
      {{ user.username }}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      :aria-label="
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      "
      :data-testid="TEST_ID.themeToggle"
      @click="toggle"
    >
      <Sun v-if="theme === 'dark'" class="h-4 w-4" />
      <Moon v-else class="h-4 w-4" />
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Log out"
      :data-testid="TEST_ID.logout"
      @click="logout"
    >
      <LogOut class="h-4 w-4" />
      <span class="hidden sm:inline">Log out</span>
    </Button>
  </header>
</template>
