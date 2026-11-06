<script setup lang="ts">
import { useI18n } from "vue-i18n";
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

const { t } = useI18n();

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
          <DialogTitle class="text-lg font-semibold">
            {{ t("storagePreview.title") }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ t("storagePreview.description") }}
          </DialogDescription>
        </div>

        <p
          v-if="isLoading"
          class="py-4 text-sm text-muted-foreground"
          :data-testid="TEST_ID.storagePreviewLoading"
        >
          {{ t("storagePreview.loading") }}
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
            {{ t("common.retry") }}
          </Button>
        </div>

        <dl v-else-if="preview" class="grid gap-2 text-sm sm:grid-cols-2">
          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">
              {{ t("storagePreview.baseline") }}
            </dt>
            <dd>
              {{
                t("storagePreview.baselineValue", {
                  overflow: preview.baselineRevisions.overflow,
                  limit: preview.baselineRevisions.limit,
                })
              }}
            </dd>
          </div>

          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">
              {{ t("storagePreview.runs") }}
            </dt>
            <dd>
              {{
                t("storagePreview.runsValue", {
                  eligible: preview.runs.eligible,
                  days: preview.runs.days,
                })
              }}
            </dd>
          </div>

          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">
              {{ t("storagePreview.branches") }}
            </dt>
            <dd>
              {{
                preview.branches.days > 0
                  ? t("storagePreview.branchesValue", {
                      eligible: preview.branches.eligible,
                      days: preview.branches.days,
                    })
                  : t("storagePreview.branchesOff")
              }}
            </dd>
          </div>

          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">
              {{ t("storagePreview.orphan") }}
            </dt>
            <dd>
              {{
                t("storagePreview.hours", {
                  count: preview.effectiveOrphanGraceHours,
                })
              }}
            </dd>
          </div>

          <div class="rounded-md border p-2">
            <dt class="text-xs text-muted-foreground">
              {{ t("storagePreview.storage") }}
            </dt>
            <dd class="flex flex-wrap items-center gap-2">
              <span>{{
                t("storagePreview.used", {
                  size: formatBytes(preview.storage.usageBytes),
                })
              }}</span>
              <span v-if="preview.storage.quotaBytes != null">
                {{
                  t("storagePreview.ofQuota", {
                    quota: formatBytes(preview.storage.quotaBytes),
                    percent: formatPercent(preview.storage.percent),
                  })
                }}
              </span>
              <span v-else class="text-muted-foreground">
                {{ t("storagePreview.noQuota") }}
              </span>
              <Badge v-if="preview.storage.warning" variant="destructive">
                {{ t("storagePreview.nearQuota") }}
              </Badge>
            </dd>
          </div>
        </dl>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.storagePreviewClose">
              {{ t("storagePreview.close") }}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
