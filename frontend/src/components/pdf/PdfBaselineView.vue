<script setup lang="ts">
import { ref } from "vue";
import PdfPageViewer from "@/components/pdf/PdfPageViewer.vue";
import PdfPageNavigation from "@/components/pdf/PdfPageNavigation.vue";

const props = defineProps<{
  projectName: string;
  testName: string;
  pdfUrl: string;
  pageCount: number;
}>();

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
      label="Baseline"
      border="green"
    />
  </div>
</template>
