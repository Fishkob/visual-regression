<script setup lang="ts">
import { ref, computed } from "vue";
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

const props = defineProps<{
  projectName: string;
  testName: string;
  baseline: PdfScreenshot;
  comparison: PdfComparison;
  isApproving?: boolean;
}>();

const emit = defineEmits<{
  approve: [];
  skip: [];
}>();

const viewMode = ref<ViewMode>("side-by-side");
const currentPage = ref(1);

const projectNameRef = computed(() => props.projectName);
const testNameRef = computed(() => props.testName);
const download = (type: PdfDownloadType) => {
  const variant =
    type === "candidate" ? props.comparison.candidate : props.baseline;
  return downloadPdfFile(projectNameRef, testNameRef, type, variant);
};

const mismatchInfo = computed(() => {
  const c = props.comparison;
  if (c.pageCount <= 0) return "Unknown page count";
  if (c.mismatchPageCount === 0) return "All pages match";
  return `${c.mismatchPageCount} of ${c.pageCount} pages differ`;
});

const hasDiff = computed(() => Boolean(props.comparison.diffPdfUrl));
</script>

<template>
  <div class="w-full">
    <div class="flex items-center mb-3">
      <ViewModeToggle v-model="viewMode" :show-diff="hasDiff" />
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
          label="Baseline"
          border="green"
        />
        <div class="text-center mt-1">
          <a
            href="#"
            class="text-xs text-muted-foreground hover:text-foreground underline"
            :data-testid="TEST_ID.downloadBaseline"
            @click.prevent="download('baseline')"
          >
            Download Baseline PDF
          </a>
        </div>
      </div>
      <div v-if="viewMode === 'side-by-side' && comparison.candidate">
        <PdfPageViewer
          :project-name="projectName"
          :test-name="testName"
          :pdf-url="comparison.candidate.pdfUrl"
          :page="currentPage"
          label="Current"
          border="blue"
        />
        <div class="text-center mt-1">
          <a
            href="#"
            class="text-xs text-muted-foreground hover:text-foreground underline"
            :data-testid="TEST_ID.downloadCandidate"
            @click.prevent="download('candidate')"
          >
            Download Candidate PDF
          </a>
        </div>
      </div>
      <div v-if="hasDiff">
        <PdfPageViewer
          :project-name="projectName"
          :test-name="testName"
          :pdf-url="comparison.diffPdfUrl"
          :page="currentPage"
          label="Diff"
          border="red"
        />
        <div class="text-center mt-1">
          <a
            href="#"
            class="text-xs text-muted-foreground hover:text-foreground underline"
            :data-testid="TEST_ID.downloadDiff"
            @click.prevent="download('diff')"
          >
            Download Diff PDF
          </a>
        </div>
      </div>
      <div
        v-else-if="viewMode === 'side-by-side'"
        class="flex items-center justify-center min-h-[200px] text-muted-foreground"
        :data-testid="TEST_ID.diffRemovedNote"
      >
        Diff removed after approval
      </div>
    </div>

    <ApproveSkipFooter
      :approved="isApproved(comparison.status)"
      :is-approving="props.isApproving"
      @skip="emit('skip')"
      @approve="emit('approve')"
    />
  </div>
</template>
