<script setup lang="ts">
import { Inbox } from "@lucide/vue";

defineProps<{
  title?: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center">
    <div class="rounded-full bg-muted p-4 mb-4">
      <Inbox class="w-8 h-8 text-muted-foreground" />
    </div>

    <h3 v-if="title" class="text-lg font-medium mb-1">
      {{ title }}
    </h3>

    <p v-if="description" class="text-sm text-muted-foreground mb-4 max-w-sm">
      {{ description }}
    </p>
  </div>
</template>
