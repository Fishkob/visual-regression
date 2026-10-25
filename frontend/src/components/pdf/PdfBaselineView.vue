<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref } from "vue";
import PdfPageViewer from "@/components/pdf/PdfPageViewer.vue";
import PdfPageNavigation from "@/components/pdf/PdfPageNavigation.vue";

defineProps<{
  projectName: string;
  testName: string;
  pdfUrl: string;
  pageCount: number;
  branchName?: string;
}>();

const { t } = useI18n();
const currentPage = ref(1);
</script>

<template>
  <div class="max-w-xl mx-auto">
    <PdfPageNavigation
      v-if="pageCount > 1"
      v-model:current-page="currentPage"
      :page-count="pageCount"
    />
    <PdfPageViewer
      :project-name="projectName"
      :test-name="testName"
      :pdf-url="pdfUrl"
      :page="currentPage"
      :label="t('pdf.baseline')"
      border="green"
      :branch-name="branchName"
    />
  </div>
</template>
