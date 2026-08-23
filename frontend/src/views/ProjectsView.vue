<script setup lang="ts">
import { ref, computed } from "vue";

import { Input } from "@/components/ui/input";
import ProjectTable from "@/components/tables/ProjectTable.vue";
import Breadcrumbs from "@/components/Breadcrumbs.vue";

import ErrorAlert from "@/components/ErrorAlert.vue";
import EmptyState from "@/components/EmptyState.vue";

import { useProjectsWithPendingQuery } from "@/composables/useProjects";
import type { Project } from "@/domains/projects/project.model";
import { TEST_ID } from "@/lib/test-ids";

/* Query */
const {
  data: projects,
  isLoading,
  error,
  refetch,
} = useProjectsWithPendingQuery();

/* Search */
const searchTerm = ref("");

const filteredProjects = computed<Project[]>(() => {
  const list = projects.value ?? [];
  const term = searchTerm.value.toLowerCase();
  return list.filter((p) => (p.name ?? "").toLowerCase().includes(term));
});
</script>

<template>
  <Breadcrumbs class="px-6 py-3 text-sm text-muted-foreground" />

  <div class="p-6 space-y-6">
    <!-- PAGE HEADER -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">Projects</h1>

      <!-- SEARCH -->
      <Input
        v-model="searchTerm"
        placeholder="Search project..."
        class="w-64 rounded-xl shadow-sm"
        :data-testid="TEST_ID.projectSearch"
      />
    </div>

    <!-- ERROR -->
    <ErrorAlert
      v-if="error"
      variant="error"
      title="Failed to load projects"
      :message="error.message"
      retry
      :onRetry="refetch"
    />

    <!-- PROJECT TABLE (with skeleton when loading) -->
    <div
      v-if="!error"
      class="rounded-xl border bg-card shadow-sm overflow-hidden"
    >
      <ProjectTable :projects="filteredProjects" :loading="isLoading" />
    </div>

    <!-- EMPTY (only when not loading and no results) -->
    <EmptyState
      v-if="!isLoading && !error && filteredProjects.length === 0"
      title="No projects found"
      description="Try a different search term."
    />
  </div>
</template>
