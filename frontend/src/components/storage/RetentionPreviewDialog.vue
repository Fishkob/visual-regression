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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatBytes,
  formatPercent,
  type RetentionPreview,
} from "@/domains/storage/storage.model";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{
  open: boolean;
  isLoading: boolean;
  error: Error | null;
  preview: RetentionPreview | null;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "retry"): void;
}>();
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.storagePreviewDialog"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold"
            >Preview cleanup</DialogTitle
          >
          <DialogDescription class="text-sm text-muted-foreground">
            Dry run — nothing is deleted. This is what the current retention
            policy would remove right now.
          </DialogDescription>
        </div>

        <p
          v-if="isLoading"
          class="py-4 text-sm text-muted-foreground"
          :data-testid="TEST_ID.storagePreviewLoading"
        >
          Calculating what would be cleaned up…
        </p>

        <div
          v-else-if="error"
          class="space-y-2 py-2"
          :data-testid="TEST_ID.storagePreviewError"
          role="alert"
        >
          <p class="text-sm text-destructive">{{ error.message }}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :data-testid="TEST_ID.storagePreviewRetry"
            @click="emit('retry')"
          >
            Try again
          </Button>
        </div>

        <dl v-else-if="preview" class="grid gap-2 text-sm sm:grid-cols-2">
          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">Baseline revisions</dt>
            <dd>
              {{ preview.baselineRevisions.overflow }} over the limit of
              {{ preview.baselineRevisions.limit }} kept per variant
            </dd>
          </div>

          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">Runs</dt>
            <dd>
              {{ preview.runs.eligible }} eligible in the
              {{ preview.runs.days }}-day window
            </dd>
          </div>

          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">Orphan grace</dt>
            <dd>{{ preview.orphanGraceHours }} hours</dd>
          </div>

          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">Storage</dt>
            <dd class="flex flex-wrap items-center gap-2">
              <span>{{ formatBytes(preview.storage.usageBytes) }} used</span>
              <span v-if="preview.storage.quotaBytes != null">
                of {{ formatBytes(preview.storage.quotaBytes) }} ({{
                  formatPercent(preview.storage.percent)
                }})
              </span>
              <span v-else class="text-muted-foreground">· No quota</span>
              <Badge v-if="preview.storage.warning" variant="destructive">
                Near quota
              </Badge>
            </dd>
          </div>
        </dl>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.storagePreviewClose">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
