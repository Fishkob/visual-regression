<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import ImageDisplay from "@/components/ImageDisplay.vue";
import { usePdfPageRenderQuery } from "@/composables/usePdfPageRender";

const props = defineProps<{
  projectName: string;
  testName: string;
  pdfUrl?: string;
  page: number;
  label: string;
  border?: "green" | "blue" | "red";
  branchName?: string;
}>();

const projectNameRef = computed(() => props.projectName);
const testNameRef = computed(() => props.testName);
const pdfUrlRef = computed(() => props.pdfUrl);
const pageRef = computed(() => props.page);
const branchNameRef = computed(() => props.branchName);

const { data, isLoading, isError, refetch } = usePdfPageRenderQuery(
  projectNameRef,
  testNameRef,
  pdfUrlRef,
  pageRef,
  branchNameRef,
);
</script>

<template>
  <div class="relative w-full">
    <ImageDisplay
      v-if="data?.imageUrl"
      :label="label"
      :border="border ?? 'green'"
      :url="data.imageUrl"
    />
    <div
      v-else-if="isLoading"
      class="flex items-center justify-center min-h-[300px] text-muted-foreground"
    >
      Loading page {{ page }}...
    </div>
    <div
      v-else-if="isError"
      class="flex flex-col items-center justify-center min-h-[300px] gap-2"
    >
      <span class="text-sm text-status-danger"
        >Failed to load page {{ page }}</span
      >
      <Button variant="outline" size="sm" @click="refetch()">Retry</Button>
    </div>
  </div>
</template>
