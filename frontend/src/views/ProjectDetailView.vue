<template>
  <Breadcrumbs
    class="px-6 py-3 text-sm text-muted-foreground"
    :group-name="project?.groupName ?? undefined"
  />

  <div class="space-y-6 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-xl font-semibold">
          {{ project?.name || projectName }}
        </h2>
        <template v-if="project">
          <Badge variant="secondary" :data-testid="TEST_ID.projectGroupBadge">
            {{ project.groupName || UNASSIGNED_GROUP_LABEL }}
          </Badge>
          <span
            class="text-sm text-muted-foreground"
            :data-testid="TEST_ID.projectPendingCount"
          >
            {{ pendingCount }}
            {{ pendingCount === 1 ? "change" : "changes" }}
          </span>
          <span
            class="text-sm text-muted-foreground"
            :data-testid="TEST_ID.projectTestCount"
          >
            {{ testCount }} {{ testCount === 1 ? "test" : "tests" }}
          </span>
        </template>
      </div>
      <Button
        v-if="project"
        type="button"
        variant="outline"
        :data-testid="TEST_ID.moveProject"
        @click="openMove"
      >
        Move to group
      </Button>
    </div>

    <AsyncState
      :is-loading="activeTabState.isLoading"
      :error="activeTabState.error"
      error-title="Failed to load project"
      :retry="activeTabState.refetch"
      :empty="tests.length === 0"
      empty-title="No tests found"
      empty-description="This project has no tests yet."
    >
      <template #loading>
        <SkeletonAccordionGroups />
      </template>
      <VisualTestsTable
        :tests="tests"
        :project-name="projectName ?? ''"
        sync-url
      />
    </AsyncState>
  </div>

  <MoveProjectDialog
    :open="moveOpen"
    :groups="groups ?? []"
    :current-group-id="project?.groupId"
    :pending="movePending"
    :error="moveError"
    @update:open="handleMoveOpen"
    @submit="move"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import Breadcrumbs from "@/components/Breadcrumbs.vue";
import AsyncState from "@/components/AsyncState.vue";
import SkeletonAccordionGroups from "@/components/cards/SkeletonAccordionGroups.vue";
import MoveProjectDialog from "@/components/projects/MoveProjectDialog.vue";
import VisualTestsTable from "@/components/tables/VisualTestsTable.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGroupsQuery } from "@/composables/useGroups";
import { useProjectDetailPage } from "@/composables/useProjectDetailPage";
import { useProjectGroupAssignment } from "@/composables/useProjectGroupAssignment";
import { useRouteParams } from "@/composables/useRouteParams";
import { UNASSIGNED_GROUP_LABEL } from "@/domains/groups/group-section";
import { TEST_ID } from "@/lib/test-ids";

const { projectName } = useRouteParams();

const { project, tests, pendingCount, testCount, activeTabState } =
  useProjectDetailPage(projectName);

const { data: groups } = useGroupsQuery();
const moveMutation = useProjectGroupAssignment();
const moveOpen = ref(false);
const movePending = computed(() => moveMutation.isPending.value);
const moveError = computed(() => moveMutation.error.value);

function openMove() {
  moveMutation.reset();
  moveOpen.value = true;
}

function handleMoveOpen(open: boolean) {
  if (!open) moveMutation.reset();
  moveOpen.value = open;
}

function move(groupId: string | null) {
  moveMutation.mutate(
    { projectName: projectName.value, groupId },
    {
      onSuccess: () => {
        moveOpen.value = false;
      },
    },
  );
}
</script>
