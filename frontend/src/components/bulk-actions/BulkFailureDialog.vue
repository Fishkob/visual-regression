<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { Button } from "@/components/ui/button";
import type { BulkFailureRow } from "@/domains/bulk-actions/bulk-action.model";
import { TEST_ID } from "@/lib/test-ids";

withDefaults(
  defineProps<{
    open: boolean;
    rows: BulkFailureRow[];
    title?: string;
    description?: string;
  }>(),
  {
    title: "Some items failed",
    description:
      "The bulk action continued past these items. Fix the cause and retry them individually.",
  },
);

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.bulkFailureDialog"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">{{ title }}</DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ description }}
          </DialogDescription>
        </div>

        <ul class="max-h-64 space-y-2 overflow-y-auto">
          <li
            v-for="row in rows"
            :key="row.id"
            class="rounded-md border p-2 text-sm"
            :data-testid="TEST_ID.bulkFailureRow"
          >
            <p class="font-medium">{{ row.label ?? row.id }}</p>
            <p class="font-mono text-xs text-muted-foreground">{{ row.id }}</p>
            <p class="text-xs text-destructive">{{ row.error }}</p>
          </li>
        </ul>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.bulkFailureDone">
              Done
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
