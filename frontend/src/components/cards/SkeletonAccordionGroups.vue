<template>
  <div class="space-y-8">
    <div
      v-for="i in 3"
      :key="i"
      :data-testid="TEST_ID.skeletonAccordionCard"
      class="rounded-xl border bg-card shadow-sm overflow-hidden"
    >
      <div
        :data-testid="TEST_ID.skeletonCardHeader"
        class="px-6 py-3 bg-muted/30 flex items-center justify-between"
      >
        <div class="h-5 w-48 bg-muted rounded animate-pulse" />
        <div class="flex items-center gap-2">
          <div
            :data-testid="TEST_ID.skeletonBadge"
            class="h-5 w-12 bg-muted rounded animate-pulse"
          />
          <div class="h-5 w-10 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div class="border-t">
        <div
          v-for="j in 4"
          :key="j"
          :data-testid="TEST_ID.skeletonRow"
          class="flex items-center gap-4 px-6 py-3 border-b last:border-b-0"
        >
          <div class="h-4 w-24 bg-muted rounded animate-pulse" />
          <div class="h-4 w-20 bg-muted rounded animate-pulse" />
          <div class="h-4 w-16 bg-muted rounded animate-pulse" />
          <div class="h-4 w-14 bg-muted rounded animate-pulse" />
          <div class="h-4 w-8 bg-muted rounded animate-pulse ml-auto" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TEST_ID } from "@/lib/test-ids";
</script>
