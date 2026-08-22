<template>
  <Breadcrumbs class="px-6 py-3 text-sm text-muted-foreground" />

  <div class="p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold">
        Project: {{ project?.name || "..." }}
      </h2>
    </div>

    <div class="flex gap-4 mb-4 border-b">
      <button
        :class="[
          'pb-2 px-1 -mb-px border-b-2 transition',
          activeTab === 'screenshots'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground',
        ]"
        @click="activeTab = 'screenshots'"
      >
        Screenshots
        <component
          v-if="screenshotPendingCount > 0"
          :is="
            getStatusCountBadge(
              STATUS.PENDING_APPROVAL,
              screenshotPendingCount,
              {
                className: 'ml-1.5 px-1.5 py-0 rounded-full',
              },
            )
          "
        />
      </button>
      <button
        :class="[
          'pb-2 px-1 -mb-px border-b-2 transition',
          activeTab === 'pdfs'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground',
        ]"
        @click="activeTab = 'pdfs'"
      >
        PDFs
        <component
          v-if="pdfPendingCount > 0"
          :is="
            getStatusCountBadge(STATUS.PENDING_APPROVAL, pdfPendingCount, {
              className: 'ml-1.5 px-1.5 py-0 rounded-full',
            })
          "
        />
      </button>
    </div>

    <template v-if="activeTab === 'screenshots'">
      <AsyncState
        :is-loading="activeTabState.isLoading"
        :error="activeTabState.error"
        error-title="Failed to load project"
        :retry="activeTabState.refetch"
        :empty="imageTests.length === 0"
        empty-title="No tests found"
        empty-description="This project has no visual tests yet."
      >
        <template #loading>
          <SkeletonAccordionGroups />
        </template>
        <VisualTestsTable
          :tests="imageTests"
          :projectName="projectName ?? ''"
        />
      </AsyncState>
    </template>

    <template v-else>
      <AsyncState
        :is-loading="activeTabState.isLoading"
        :error="activeTabState.error"
        error-title="Failed to load PDF tests"
        :retry="activeTabState.refetch"
        :empty="!pdfTests?.length"
        empty-title="No PDF tests found"
        empty-description="This project has no PDF tests yet."
      >
        <template #loading>
          <div
            class="divide-y rounded-xl border bg-card shadow-sm overflow-hidden"
          >
            <div
              v-for="i in 5"
              :key="i"
              class="flex items-center justify-between px-4 py-3"
            >
              <div class="h-4 w-48 bg-muted rounded animate-pulse" />
              <div class="h-4 w-16 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </template>
        <ul class="divide-y">
          <li v-for="test in pdfTests" :key="test.name">
            <button
              type="button"
              class="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/50 rounded transition text-left"
              @click="navigateToPdfTest(test)"
            >
              <span class="font-medium">{{ test.name }}</span>
              <component :is="getStatusBadge(test.status)" />
            </button>
          </li>
        </ul>
      </AsyncState>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import Breadcrumbs from "@/components/Breadcrumbs.vue";
import VisualTestsTable from "@/components/tables/VisualTestsTable.vue";
import SkeletonAccordionGroups from "@/components/cards/SkeletonAccordionGroups.vue";
import AsyncState from "@/components/AsyncState.vue";
import { useProjectDetailPage } from "@/composables/useProjectDetailPage";
import type { ProjectDetailTab } from "@/composables/useProjectDetailPage";
import { useRouteParams } from "@/composables/useRouteParams";
import { useTestNavigation } from "@/composables/useTestNavigation";
import type { PdfProjectTest } from "@/domains/pdf-test/pdf-test.model";
import { STATUS } from "@/domains/test-status";
import { getStatusBadge, getStatusCountBadge } from "@/components/StatusBadge";

const { projectName } = useRouteParams();
const route = useRoute();
const router = useRouter();

const { navigateToTest } = useTestNavigation({ projectName });

function navigateToPdfTest(test: PdfProjectTest) {
  navigateToTest(test);
}

const activeTab = computed<ProjectDetailTab>({
  get: () => (route.query.tab === "pdf" ? "pdfs" : "screenshots"),
  set: (tab: ProjectDetailTab) => {
    router.push({
      query: { ...route.query, tab: tab === "pdfs" ? "pdf" : undefined },
    });
  },
});

const {
  project,
  imageTests,
  screenshotPendingCount,
  pdfPendingCount,
  pdfTests,
  activeTabState,
} = useProjectDetailPage(projectName);
</script>
