<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref, computed } from "vue";
import ApprovalDecisionDialog from "@/components/approvals/ApprovalDecisionDialog.vue";
import { Badge } from "@/components/ui/badge";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/components/ui/view-mode-toggle";
import PdfPageViewer from "@/components/pdf/PdfPageViewer.vue";
import PdfPageNavigation from "@/components/pdf/PdfPageNavigation.vue";
import ApproveSkipFooter from "@/components/ApproveSkipFooter.vue";
import { isApproved } from "@/domains/test-status";
import { downloadPdfFile, type PdfDownloadType } from "@/lib/pdf-download";
import { TEST_ID } from "@/lib/test-ids";
import type {
  PdfComparison,
  PdfScreenshot,
} from "@/domains/pdf-test/pdf-test.model";
import type { ApprovalDecision } from "@/domains/approvals/approval-reason";

const { t } = useI18n();

const props = defineProps<{
  projectName: string;
  testName: string;
  baseline: PdfScreenshot;
  comparison: PdfComparison;
  isApproving?: boolean;
  branchName?: string;
  // Inherited baselines are read-only on this branch: the approve/skip actions
  // belong to the branch that owns the baseline.
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  approve: [decision: ApprovalDecision];
  skip: [];
}>();

const decisionOpen = ref(false);

// One entry point for "ask for the approval decision": the footer button and
// the review shortcut both reach it, so `A` cannot commit without the
// reason/note step the button enforces (ADR-040).
function openDecision(): void {
  decisionOpen.value = true;
}

defineExpose({ openDecision });

const viewMode = ref<ViewMode>("side-by-side");
const currentPage = ref(1);

const projectNameRef = computed(() => props.projectName);
const testNameRef = computed(() => props.testName);
const download = (type: PdfDownloadType) => {
  const variant =
    type === "candidate" ? props.comparison.candidate : props.baseline;
  return downloadPdfFile(
    projectNameRef,
    testNameRef,
    type,
    variant,
    props.branchName,
  );
};

const mismatchInfo = computed(() => {
  const c = props.comparison;
  if (c.pageCount <= 0) return t("pdf.unknownPageCount");
  if (c.mismatchPageCount === 0) return t("pdf.allPagesMatch");
  return t("pdf.pagesDiffer", {
    mismatch: c.mismatchPageCount,
    count: c.pageCount,
  });
});

const hasDiff = computed(() => Boolean(props.comparison.diffPdfUrl));
</script>

<template>
  <div class="w-full">
    <div class="flex items-center mb-3">
      <!-- Overlay/wipe layer two images; PDF pages are rendered documents. -->
      <ViewModeToggle
        v-model="viewMode"
        :show-diff="hasDiff"
        :show-layered="false"
      />
      <div
        class="flex-1 text-center text-sm text-muted-foreground"
        :data-testid="TEST_ID.mismatchInfo"
      >
        {{ mismatchInfo }}
      </div>
      <Badge v-if="baseline.environment" variant="outline" class="px-2 py-0.5">
        {{ baseline.environment }}
      </Badge>
    </div>

    <PdfPageNavigation
      v-if="comparison.pageCount > 1"
      v-model:current-page="currentPage"
      :page-count="comparison.pageCount"
    />

    <div
      v-if="comparison.pageCount <= 0"
      class="text-center py-8 text-muted-foreground"
    >
      No pages available for this PDF comparison.
    </div>

    <div
      v-else
      class="grid gap-4"
      :class="
        viewMode === 'diff-only'
          ? 'grid-cols-1 mx-auto max-w-5xl'
          : hasDiff
            ? 'grid-cols-3'
            : 'grid-cols-2'
      "
    >
      <div v-if="viewMode === 'side-by-side'">
        <PdfPageViewer
          :project-name="projectName"
          :test-name="testName"
          :pdf-url="baseline.pdfUrl"
          :page="currentPage"
          :label="t('pdf.baseline')"
          border="green"
          :branch-name="branchName"
        />
        <div class="text-center mt-1">
          <a
            href="#"
            class="text-xs text-muted-foreground hover:text-foreground underline"
            :data-testid="TEST_ID.downloadBaseline"
            @click.prevent="download('baseline')"
          >
            {{ t("pdf.downloadBaseline") }}
          </a>
        </div>
      </div>
      <div v-if="viewMode === 'side-by-side' && comparison.candidate">
        <PdfPageViewer
          :project-name="projectName"
          :test-name="testName"
          :pdf-url="comparison.candidate.pdfUrl"
          :page="currentPage"
          :label="t('pdf.current')"
          border="blue"
          :branch-name="branchName"
        />
        <div class="text-center mt-1">
          <a
            href="#"
            class="text-xs text-muted-foreground hover:text-foreground underline"
            :data-testid="TEST_ID.downloadCandidate"
            @click.prevent="download('candidate')"
          >
            {{ t("pdf.downloadCandidate") }}
          </a>
        </div>
      </div>
      <div v-if="hasDiff">
        <PdfPageViewer
          :project-name="projectName"
          :test-name="testName"
          :pdf-url="comparison.diffPdfUrl"
          :page="currentPage"
          :label="t('pdf.diff')"
          border="red"
          :branch-name="branchName"
        />
        <div class="text-center mt-1">
          <a
            href="#"
            class="text-xs text-muted-foreground hover:text-foreground underline"
            :data-testid="TEST_ID.downloadDiff"
            @click.prevent="download('diff')"
          >
            {{ t("pdf.downloadDiff") }}
          </a>
        </div>
      </div>
      <div
        v-else-if="viewMode === 'side-by-side'"
        class="flex items-center justify-center min-h-[200px] text-muted-foreground"
        :data-testid="TEST_ID.diffRemovedNote"
      >
        {{ t("pdf.diffRemoved") }}
      </div>
    </div>

    <ApproveSkipFooter
      v-if="!readOnly"
      :approved="isApproved(comparison.status)"
      :is-approving="props.isApproving"
      @skip="emit('skip')"
      @approve="decisionOpen = true"
    />

    <ApprovalDecisionDialog
      :open="decisionOpen"
      @update:open="decisionOpen = $event"
      @confirm="emit('approve', $event)"
    />
  </div>
</template>
