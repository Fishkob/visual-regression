<script setup lang="ts">
import { computed, ref, toRef } from "vue";
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
const REASON_LABELS: Record<BaselineRevisionReason, string> = {
  approval: "Approval",
  restore: "Restore",
  import: "Import",
};

function isCurrent(revision: BaselineRevision): boolean {
  return !!props.currentHash && revision.imageHash === props.currentHash;
}

function pageCountLabel(revision: BaselineRevision): string | null {
  if (revision.pageCount == null) return null;
  return `${revision.pageCount} page${revision.pageCount === 1 ? "" : "s"}`;
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
  const when = target ? ` from ${formatRelativeAge(target.createdAt)}` : "";
  return `Restoring the baseline${when} replaces the current baseline of this variant and retires any pending comparison. The baseline in place now stays in the history.`;
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
            Baseline history ({{ rows.length }})
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
            <span class="sr-only">Loading baseline history</span>
          </div>

          <ErrorAlert
            v-else-if="error"
            variant="error"
            title="Failed to load baseline history"
            :message="error.message"
            retry
            :on-retry="() => refetch()"
          />

          <p
            v-else-if="rows.length === 0"
            class="py-4 text-sm text-muted-foreground"
            :data-testid="TEST_ID.baselineHistoryEmpty"
          >
            No replaced baselines yet — approving a change will keep the
            previous baseline here.
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
                :alt="`Baseline from ${formatRelativeAge(revision.createdAt)}`"
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
                    {{ REASON_LABELS[revision.reason] }}
                  </Badge>
                  <Badge v-if="isCurrent(revision)" variant="outline">
                    current
                  </Badge>
                  <span class="truncate text-sm">
                    {{ revision.createdBy ?? "unknown" }}
                  </span>
                </div>

                <div
                  class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                >
                  <span :title="new Date(revision.createdAt).toLocaleString()">
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
                :aria-label="`Restore the baseline from ${formatRelativeAge(revision.createdAt)}`"
                :data-testid="TEST_ID.baselineHistoryRestore"
                @click="askRestore(revision)"
              >
                Restore
              </Button>
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    <ConfirmDialog
      :open="confirmOpen"
      title="Restore this baseline?"
      :description="confirmDescription"
      confirm-text="Restore baseline"
      :pending="isPending"
      @update:open="(open: boolean) => (confirmOpen = open)"
      @confirm="confirmRestore"
    />
  </div>
</template>
