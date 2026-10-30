<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { FileText, RotateCcw } from "@lucide/vue";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type {
  BaselineRevision,
  BaselineRevisionReason,
} from "@/domains/baseline-history/baseline-history.model";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

// A replaced baseline as a picture instead of a 64px thumbnail: the reason to
// restore one is "that looked right", which a row's metadata cannot answer.
// Restoring stays the history panel's decision — this dialog only asks for it.
const props = defineProps<{
  open: boolean;
  revision: BaselineRevision | null;
  kind: "image" | "pdf";
  canRestore: boolean;
  current: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  restore: [];
}>();

const { t } = useI18n();

const REASON_KEY: Record<BaselineRevisionReason, string> = {
  approval: "baseline.reason.approval",
  restore: "baseline.reason.restore",
  import: "baseline.reason.import",
};

const age = computed(() =>
  props.revision ? formatRelativeAge(props.revision.createdAt) : "",
);

const title = computed(() =>
  props.revision ? t("baseline.previewTitle", { age: age.value }) : "",
);

const description = computed(() => {
  if (!props.revision) return "";
  return t("baseline.previewDescription", {
    reason: t(REASON_KEY[props.revision.reason]),
    user: props.revision.createdBy ?? t("baseline.unknown"),
  });
});

const meta = computed(() => {
  const revision = props.revision;
  if (!revision) return [];
  return [
    t("baseline.thresholdMeta", { px: revision.pixelDiffThreshold }),
    ...(revision.pageCount != null
      ? [t("baseline.pageCount", revision.pageCount)]
      : []),
    formatDateTime(new Date(revision.createdAt)),
  ];
});
</script>

<template>
  <AlertDialog
    :open="open"
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <AlertDialogContent
      class="sm:max-w-3xl"
      :data-testid="TEST_ID.baselinePreview"
    >
      <AlertDialogHeader>
        <AlertDialogTitle :data-testid="TEST_ID.dialogTitle">
          {{ title }}
        </AlertDialogTitle>
        <AlertDialogDescription :data-testid="TEST_ID.dialogDescription">
          {{ description }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="overflow-hidden rounded-md border bg-muted">
        <img
          v-if="revision && kind !== 'pdf'"
          :src="revision.imageUrl"
          :alt="title"
          class="max-h-[60vh] w-full object-contain"
          :data-testid="TEST_ID.baselinePreviewImage"
        />
        <div
          v-else
          class="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground"
        >
          <FileText class="size-8" aria-hidden="true" />
          <span class="text-sm">{{ t("baseline.previewNoImage") }}</span>
        </div>
      </div>

      <p class="text-xs text-muted-foreground">
        {{ meta.join(" · ") }}
      </p>

      <AlertDialogFooter>
        <AlertDialogCancel
          type="button"
          :data-testid="TEST_ID.baselinePreviewClose"
        >
          {{ t("common.close") }}
        </AlertDialogCancel>
        <Button
          v-if="canRestore"
          type="button"
          :disabled="current || pending"
          :data-testid="TEST_ID.baselinePreviewRestore"
          @click="emit('restore')"
        >
          <RotateCcw />
          {{ t("baseline.restore") }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
