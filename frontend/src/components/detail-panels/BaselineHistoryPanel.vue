<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { formatDateTime } from "@/lib/format-date";
import { FileText } from "@lucide/vue";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import { useBaselineHistory } from "@/composables/useBaselineHistory";
import { useRestoreBaseline } from "@/composables/useRestoreBaseline";
import { useCurrentRole } from "@/composables/useAuth";
import type {
  BaselineRevision,
  BaselineRevisionReason,
} from "@/domains/baseline-history/baseline-history.model";
import { formatRelativeAge } from "@/lib/format-date";
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

const restoreTarget = ref<BaselineRevision | null>(null);
const confirmOpen = ref(false);

function askRestore(revision: BaselineRevision) {
  restoreTarget.value = revision;
  confirmOpen.value = true;
}

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
    <Accordion type="single" collapsible default-value="history">
      <AccordionItem
        value="history"
        class="rounded-xl border bg-card shadow-sm"
      >
        <AccordionTrigger
          class="px-4 py-3 hover:no-underline"
          :data-testid="TEST_ID.baselineHistoryToggle"
        >
          <span class="text-sm font-semibold">
            {{ t("baseline.title", { count: rows.length }) }}
          </span>
        </AccordionTrigger>

        <AccordionContent class="px-4">
          <div
            v-if="isLoading"
            class="space-y-2 py-2"
            role="status"
            aria-live="polite"
          >
            <div
              v-for="row in 3"
              :key="row"
              class="h-14 animate-pulse rounded-md bg-muted"
            />
            <span class="sr-only">{{ t("baseline.loading") }}</span>
          </div>

          <ErrorAlert
            v-else-if="error"
            variant="error"
            :title="t('baseline.errorTitle')"
            :message="error.message"
            retry
            :on-retry="() => refetch()"
          />

          <p
            v-else-if="rows.length === 0"
            class="py-4 text-sm text-muted-foreground"
            :data-testid="TEST_ID.baselineHistoryEmpty"
          >
            {{ t("baseline.empty") }}
          </p>

          <ul v-else class="divide-y">
            <li
              v-for="revision in rows"
              :key="revision.id"
              class="flex items-center gap-3 py-3"
              :data-testid="TEST_ID.baselineHistoryRow"
            >
              <img
                v-if="kind !== 'pdf'"
                :src="revision.imageUrl"
                :alt="
                  t('baseline.thumbAlt', {
                    age: formatRelativeAge(revision.createdAt),
                  })
                "
                loading="lazy"
                class="h-12 w-16 shrink-0 rounded border bg-muted object-cover"
                :data-testid="TEST_ID.baselineHistoryThumb"
              />
              <div
                v-else
                class="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded border bg-muted text-muted-foreground"
                :data-testid="TEST_ID.baselineHistoryThumb"
              >
                <FileText class="size-4" aria-hidden="true" />
                <span class="text-[10px] font-medium">PDF</span>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    :data-testid="TEST_ID.baselineHistoryReason"
                  >
                    {{ t(REASON_KEY[revision.reason]) }}
                  </Badge>
                  <Badge v-if="isCurrent(revision)" variant="outline">
                    {{ t("baseline.current") }}
                  </Badge>
                  <span class="truncate text-sm">
                    {{ revision.createdBy ?? t("baseline.unknown") }}
                  </span>
                </div>

                <div
                  class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                >
                  <span :title="formatDateTime(new Date(revision.createdAt))">
                    {{ formatRelativeAge(revision.createdAt) }}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>≤ {{ revision.pixelDiffThreshold }} px</span>
                  <template v-if="pageCountLabel(revision)">
                    <span aria-hidden="true">·</span>
                    <span>{{ pageCountLabel(revision) }}</span>
                  </template>
                </div>
              </div>

              <Button
                v-if="!readOnly && canWrite"
                type="button"
                variant="outline"
                size="sm"
                :disabled="isCurrent(revision) || isPending"
                :aria-label="
                  t('baseline.restoreAria', {
                    age: formatRelativeAge(revision.createdAt),
                  })
                "
                :data-testid="TEST_ID.baselineHistoryRestore"
                @click="askRestore(revision)"
              >
                {{ t("baseline.restore") }}
              </Button>
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>

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
