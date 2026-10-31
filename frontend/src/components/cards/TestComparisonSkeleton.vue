<script setup lang="ts">
import { useI18n } from "vue-i18n";

// Placeholder for the comparison body only: the page frame (header, metadata,
// activity rail) renders for real while the details query runs, so this block
// has to occupy the same footprint as the loaded comparison — the facts line,
// the viewer toolbar, its three panels and the decision footer. Skipping
// through a pass then reads as the picture reloading in place instead of the
// whole page collapsing. The consumer supplies the page padding.
const { t } = useI18n();
</script>

<template>
  <div class="w-full" role="status">
    <span class="sr-only">{{ t("common.loading") }}</span>

    <div class="mb-2 h-[18px] w-1/2 max-w-md animate-pulse rounded bg-muted" />

    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="h-9 w-72 animate-pulse rounded-lg bg-muted" />
      <div class="h-9 w-40 animate-pulse rounded-lg bg-muted" />
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div
        v-for="panel in 3"
        :key="panel"
        class="rounded-3xl border border-border bg-card p-4 shadow"
      >
        <div class="mb-3 flex items-center gap-2">
          <span class="h-3 w-3 rounded-full bg-muted" />
          <span class="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div class="h-[300px] animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>

    <div class="mt-10 flex gap-4">
      <div class="h-9 flex-1 animate-pulse rounded-lg bg-muted" />
      <div class="h-9 flex-1 animate-pulse rounded-lg bg-muted" />
    </div>
  </div>
</template>
