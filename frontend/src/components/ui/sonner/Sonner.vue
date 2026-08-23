<script lang="ts" setup>
import { Toaster as Sonner, type ToasterProps } from "vue-sonner";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<ToasterProps>();
</script>

<template>
  <Sonner
    class="toaster group"
    :data-testid="TEST_ID.toaster"
    v-bind="props"
    :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
    }"
  />
</template>
