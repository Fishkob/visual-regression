<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AsyncState from "@/components/AsyncState.vue";
import EditStorageRetentionDialog from "@/components/storage/EditStorageRetentionDialog.vue";
import RetentionPreviewDialog from "@/components/storage/RetentionPreviewDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentRole } from "@/composables/useAuth";
import {
  useProjectStorage,
  useRetentionPreview,
  useUpdateProjectStorage,
} from "@/composables/useProjectStorage";
import {
  formatBytes,
  formatPercent,
  type UpdateProjectStorageInput,
} from "@/domains/storage/storage.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{ projectName: string }>();

const { t } = useI18n();

const {
  data: storage,
  isLoading,
  error,
  refetch,
} = useProjectStorage(props.projectName);
const update = useUpdateProjectStorage(props.projectName);

// The dry-run is only fetched once the preview dialog is opened.
const previewOpen = ref(false);
const {
  data: preview,
  isLoading: previewLoading,
  error: previewError,
  refetch: refetchPreview,
} = useRetentionPreview(
  props.projectName,
  computed(() => previewOpen.value),
);
// Retention/quota changes are writes; a VIEWER sees the panel read-only.
const { canWrite } = useCurrentRole();

const dialogOpen = ref(false);

const quotaLabel = computed(() =>
  storage.value?.quotaBytes == null
    ? t("storage.noQuota")
    : formatBytes(storage.value.quotaBytes),
);

function retentionText(
  value: number | null,
  key: "revisions" | "days" | "hours",
): string {
  return value === null
    ? t("storage.globalDefault")
    : t(`storage.${key}`, value);
}
const progressPercent = computed(() =>
  Math.min(100, Math.max(0, storage.value?.percent ?? 0)),
);

function openDialog() {
  update.reset();
  dialogOpen.value = true;
}

function submit(payload: UpdateProjectStorageInput) {
  update.mutate(payload, {
    onSuccess: () => {
      dialogOpen.value = false;
    },
  });
}
</script>

<template>
  <section
    class="rounded-xl border bg-card p-4 shadow-sm"
    :data-testid="TEST_ID.storagePanel"
  >
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="font-medium">{{ t("storage.title") }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t("storage.description") }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          :data-testid="TEST_ID.storagePreviewAction"
          @click="previewOpen = true"
        >
          {{ t("storage.previewAction") }}
        </Button>
        <Button
          v-if="canWrite && storage"
          type="button"
          variant="outline"
          size="sm"
          :data-testid="TEST_ID.storageEditAction"
          @click="openDialog"
        >
          {{ t("storage.editAction") }}
        </Button>
      </div>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('storage.errorTitle')"
      :retry="refetch"
      :empty="!storage"
    >
      <template #loading>
        <div class="mt-3 space-y-2" aria-hidden="true">
          <div class="h-5 w-48 animate-pulse rounded bg-muted" />
          <div class="h-2 w-full animate-pulse rounded-full bg-muted" />
          <div class="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      </template>

      <template #empty>
        <p class="mt-3 text-sm text-muted-foreground">
          {{ t("storage.empty") }}
        </p>
      </template>

      <div v-if="storage" class="mt-3 space-y-3">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p class="text-lg font-semibold" :data-testid="TEST_ID.storageUsage">
            {{ t("storage.usage", { size: formatBytes(storage.usageBytes) }) }}
          </p>
          <span class="text-sm text-muted-foreground">
            {{ t("storage.of") }}
            <span :data-testid="TEST_ID.storageQuota">{{ quotaLabel }}</span>
          </span>
          <span
            v-if="storage.quotaBytes != null"
            class="text-sm text-muted-foreground"
          >
            ({{ formatPercent(storage.percent) }})
          </span>
          <Badge
            v-if="storage.warning"
            variant="destructive"
            :data-testid="TEST_ID.storageWarning"
          >
            {{ t("storage.warning", { percent: storage.softPercent }) }}
          </Badge>
        </div>

        <div
          class="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          :aria-label="t('storage.ariaUsage')"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="progressPercent"
          :data-testid="TEST_ID.storageProgress"
        >
          <div
            class="h-full rounded-full transition-[width]"
            :class="storage.warning ? 'bg-destructive' : 'bg-primary'"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>

        <p class="text-sm text-muted-foreground">
          {{ t("storage.files", storage.fileCount) }} ·
          {{ t("storage.diffs", storage.diffCount) }}
        </p>

        <p class="text-sm" :data-testid="TEST_ID.storageRetention">
          {{ t("storage.baseline") }}
          <span class="font-medium">
            {{ retentionText(storage.baselineRevisionLimit, "revisions") }}
          </span>
          · {{ t("storage.runHistory") }}
          <span class="font-medium">
            {{ retentionText(storage.runHistoryDays, "days") }}
          </span>
          · {{ t("storage.orphan") }}
          <span class="font-medium">
            {{ retentionText(storage.orphanGraceHours, "hours") }}
          </span>
        </p>

        <p class="text-xs text-muted-foreground">
          {{ t("storage.retentionNote") }}
        </p>
      </div>
    </AsyncState>

    <EditStorageRetentionDialog
      :open="dialogOpen"
      :storage="storage"
      :pending="update.isPending.value"
      :error="update.error.value"
      @update:open="dialogOpen = $event"
      @submit="submit"
    />

    <RetentionPreviewDialog
      :open="previewOpen"
      :is-loading="previewLoading"
      :error="previewError"
      :preview="preview ?? null"
      @update:open="previewOpen = $event"
      @retry="refetchPreview()"
    />
  </section>
</template>
