<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { FileText, Maximize2, RotateCcw } from "@lucide/vue";
import AsyncState from "@/components/AsyncState.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import BaselinePreviewDialog from "@/components/detail-panels/BaselinePreviewDialog.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { useBaselineHistory } from "@/composables/useBaselineHistory";
import { useRestoreBaseline } from "@/composables/useRestoreBaseline";
import { useCurrentRole } from "@/composables/useAuth";
import type {
  BaselineRevision,
  BaselineRevisionReason,
} from "@/domains/baseline-history/baseline-history.model";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";
import type { VariantParams } from "@/lib/variant-key";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    projectName: string;
    testName: string;
    branch?: string;
    // The variant the details resolve to: history and restore are per variant.
    variant: VariantParams;
    // Hash of the baseline in place: a revision that already is the current
    // baseline cannot be restored (the backend answers 409).
    currentHash?: string;
    // A PDF revision has no renderable thumbnail; the row shows an icon and the
    // page count the DTO recorded instead.
    kind?: "image" | "pdf";
    // An inherited baseline is read-only on this branch (the backend answers
    // 409), so restore is not offered at all.
    readOnly?: boolean;
  }>(),
  { kind: "image", readOnly: false },
);

// Content only: the rail owns the header and its tab, and gets the size so the
// tab can carry the count.
const emit = defineEmits<{
  "update:count": [count: number];
}>();

const {
  data: revisions,
  isLoading,
  error,
  refetch,
} = useBaselineHistory({
  projectName: toRef(props, "projectName"),
  testName: toRef(props, "testName"),
  branchName: toRef(props, "branch"),
  variant: toRef(props, "variant"),
});

const { restore, isPending } = useRestoreBaseline({
  projectName: toRef(props, "projectName"),
  testName: toRef(props, "testName"),
  branchName: toRef(props, "branch"),
  variant: toRef(props, "variant"),
});

// Restoring is a baseline write: a VIEWER sees the history but no restore
// affordance (the backend would answer 403). MEMBER keeps it.
const { canWrite } = useCurrentRole();

const rows = computed(() => revisions.value ?? []);
const canRestore = computed(() => !props.readOnly && canWrite.value);

watch(rows, (list) => emit("update:count", list.length), { immediate: true });

// The reason names the overwrite that retired the recorded baseline, so the
// badge reads as "what happened to it", not as a status of the image.
const REASON_KEY: Record<BaselineRevisionReason, string> = {
  approval: "baseline.reason.approval",
  restore: "baseline.reason.restore",
  import: "baseline.reason.import",
};

function isCurrent(revision: BaselineRevision): boolean {
  return !!props.currentHash && revision.imageHash === props.currentHash;
}

function pageCountLabel(revision: BaselineRevision): string | null {
  if (revision.pageCount == null) return null;
  return t("baseline.pageCount", revision.pageCount);
}

function thumbAlt(revision: BaselineRevision): string {
  return t("baseline.thumbAlt", {
    age: formatRelativeAge(revision.createdAt),
  });
}

const previewOpen = ref(false);
const previewTarget = ref<BaselineRevision | null>(null);

function openPreview(revision: BaselineRevision) {
  previewTarget.value = revision;
  previewOpen.value = true;
}

const restoreTarget = ref<BaselineRevision | null>(null);
const confirmOpen = ref(false);

function askRestore(revision: BaselineRevision) {
  restoreTarget.value = revision;
  confirmOpen.value = true;
}

// Restoring from the preview first steps back to the confirmation: the dialog
// shows a picture, not the consequences of replacing the live baseline.
function restoreFromPreview() {
  if (!previewTarget.value) return;
  previewOpen.value = false;
  askRestore(previewTarget.value);
}

// The confirm dialog closes itself on confirm (ConfirmDialog's contract), so
// the target only has to survive until the mutation is sent.
function confirmRestore() {
  const target = restoreTarget.value;
  if (!target) return;
  restore(target.id);
}

const confirmDescription = computed(() => {
  const target = restoreTarget.value;
  const when = target
    ? t("baseline.when", { age: formatRelativeAge(target.createdAt) })
    : "";
  return t("baseline.confirmDescription", { when });
});
</script>

<template>
  <div :data-testid="TEST_ID.baselineHistorySection">
    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('baseline.errorTitle')"
      :retry="refetch"
      :empty="rows.length === 0"
    >
      <template #loading>
        <div class="space-y-3 px-4 py-3" role="status" aria-live="polite">
          <div
            v-for="row in 3"
            :key="row"
            class="h-14 animate-pulse rounded-md bg-muted"
          />
          <span class="sr-only">{{ t("baseline.loading") }}</span>
        </div>
      </template>

      <template #empty>
        <p
          class="px-4 py-6 text-sm text-muted-foreground"
          :data-testid="TEST_ID.baselineHistoryEmpty"
        >
          {{ t("baseline.empty") }}
        </p>
      </template>

      <ul class="divide-y px-4">
        <li
          v-for="revision in rows"
          :key="revision.id"
          class="flex items-center gap-3 py-3"
          :data-testid="TEST_ID.baselineHistoryRow"
        >
          <button
            v-if="kind !== 'pdf'"
            type="button"
            class="group relative h-12 w-16 shrink-0 overflow-hidden rounded-md border bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            :aria-label="
              t('baseline.previewOpenAria', {
                age: formatRelativeAge(revision.createdAt),
              })
            "
            :data-testid="TEST_ID.baselinePreviewOpen"
            @click="openPreview(revision)"
          >
            <img
              :src="revision.imageUrl"
              :alt="thumbAlt(revision)"
              loading="lazy"
              class="h-full w-full object-cover"
              :data-testid="TEST_ID.baselineHistoryThumb"
            />
            <span
              class="absolute inset-0 flex items-center justify-center bg-background/70 text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <Maximize2 class="size-3.5" aria-hidden="true" />
            </span>
          </button>

          <div
            v-else
            class="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border bg-muted text-muted-foreground"
            :data-testid="TEST_ID.baselineHistoryThumb"
          >
            <FileText class="size-4" aria-hidden="true" />
            <span class="text-[10px] font-medium">PDF</span>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                class="text-[10px]"
                :data-testid="TEST_ID.baselineHistoryReason"
                :data-reason="revision.reason"
              >
                {{ t(REASON_KEY[revision.reason]) }}
              </Badge>
              <Badge
                v-if="isCurrent(revision)"
                variant="outline"
                class="text-[10px]"
              >
                {{ t("baseline.current") }}
              </Badge>
            </div>

            <p class="mt-0.5 truncate text-xs">
              <span class="text-foreground/90">
                {{ revision.createdBy ?? t("baseline.unknown") }}
              </span>
              <span
                class="text-muted-foreground"
                :title="formatDateTime(new Date(revision.createdAt))"
              >
                · {{ formatRelativeAge(revision.createdAt) }}
              </span>
            </p>

            <p
              class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground"
            >
              <span>
                {{
                  t("baseline.thresholdMeta", {
                    px: revision.pixelDiffThreshold,
                  })
                }}
              </span>
              <template v-if="pageCountLabel(revision)">
                <span aria-hidden="true">·</span>
                <span>{{ pageCountLabel(revision) }}</span>
              </template>
            </p>
          </div>

          <Button
            v-if="canRestore"
            type="button"
            variant="ghost"
            size="icon"
            class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            :disabled="isCurrent(revision) || isPending"
            :aria-label="
              t('baseline.restoreAria', {
                age: formatRelativeAge(revision.createdAt),
              })
            "
            :title="t('baseline.restore')"
            :data-testid="TEST_ID.baselineHistoryRestore"
            @click="askRestore(revision)"
          >
            <RotateCcw class="size-4" />
          </Button>
        </li>
      </ul>
    </AsyncState>

    <BaselinePreviewDialog
      :open="previewOpen"
      :revision="previewTarget"
      :kind="kind"
      :can-restore="canRestore"
      :current="previewTarget ? isCurrent(previewTarget) : false"
      :pending="isPending"
      @update:open="previewOpen = $event"
      @restore="restoreFromPreview"
    />

    <ConfirmDialog
      :open="confirmOpen"
      :title="t('baseline.confirmTitle')"
      :description="confirmDescription"
      :confirm-text="t('baseline.confirmText')"
      :pending="isPending"
      @update:open="(open: boolean) => (confirmOpen = open)"
      @confirm="confirmRestore"
    />
  </div>
</template>
