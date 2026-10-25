<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatDateTime } from "@/lib/format-date";
import { useRoute, useRouter } from "vue-router";
import AssignReviewDialog from "@/components/test-lifecycle/AssignReviewDialog.vue";
import EditTestDialog from "@/components/test-lifecycle/EditTestDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMeQuery, useCurrentRole } from "@/composables/useAuth";
import {
  useCompleteAssignment,
  useMyAssignmentsQuery,
} from "@/composables/useAssignments";
import { useRouteParams } from "@/composables/useRouteParams";
import {
  useTestMetadata,
  useUpdateTestMetadata,
} from "@/composables/useTestLifecycle";
import type { UpdateTestMetadataInput } from "@/domains/test-lifecycle/test-metadata.model";
import {
  isOpenAssignment,
  matchesAssignmentScope,
} from "@/domains/assignments/assignment.model";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();
const { projectName, testName, branch } = useRouteParams();
const router = useRouter();
const route = useRoute();

// Editing is a write; a VIEWER sees the badges but no edit action.
const { canWrite } = useCurrentRole();

const { data: metadata } = useTestMetadata(projectName, testName, branch);
const update = useUpdateTestMetadata(projectName, testName, branch);

const dialogOpen = ref(false);
const assignOpen = ref(false);

const { data: me } = useMeQuery();
const { data: assignments } = useMyAssignmentsQuery();
const completeAssignment = useCompleteAssignment();

// Only an open assignment of this exact project/test/branch is actionable here;
// a completed or sibling-variant assignment is not shown.
const assignment = computed(() =>
  (assignments.value ?? []).find(
    (entry) =>
      isOpenAssignment(entry) &&
      matchesAssignmentScope(entry, {
        projectName: projectName.value,
        testName: testName.value,
        branch: branch.value,
      }),
  ),
);
const canCompleteAssignment = computed(
  () => assignment.value?.assigneeUsername === me.value?.username,
);
const assignmentDue = computed(() =>
  assignment.value?.dueAt ? formatDateTime(assignment.value.dueAt) : "",
);

const mutedLabel = computed(() => {
  const until = metadata.value?.mutedUntil;
  if (!until) return "";
  const date = new Date(until);
  return Number.isNaN(date.getTime()) ? until : formatDateTime(date);
});

function openDialog() {
  update.reset();
  dialogOpen.value = true;
}

function submit(payload: UpdateTestMetadataInput) {
  const previousName = testName.value;
  update.mutate(payload, {
    onSuccess: (saved) => {
      dialogOpen.value = false;
      // A rename changes the route identity; keep the branch/query so the new
      // page resolves the same variant. Everything else just refreshes in place.
      if (saved.name && saved.name !== previousName) {
        void router.replace({
          name: typeof route.name === "string" ? route.name : "test-detail",
          params: { ...route.params, testName: saved.name },
          query: route.query,
        });
      }
    },
  });
}

function unmute() {
  update.mutate(
    { mutedUntil: null, muteReason: null },
    {
      onSuccess: () => {
        dialogOpen.value = false;
      },
    },
  );
}
</script>

<template>
  <div v-if="metadata" class="flex flex-wrap items-center gap-2">
    <Badge
      v-if="metadata.isMuted"
      variant="secondary"
      class="text-xs"
      :title="metadata.muteReason ?? undefined"
      :data-testid="TEST_ID.testMutedBadge"
    >
      {{ t("lifecycle.mutedBadge", { date: mutedLabel }) }}
    </Badge>

    <Badge
      variant="outline"
      class="text-xs"
      :title="
        t('lifecycle.flakeTitle', {
          changed: metadata.flake.changed,
          clean: metadata.flake.clean,
        })
      "
      :data-testid="TEST_ID.testFlakeBadge"
    >
      {{ t("lifecycle.flake", { count: metadata.flake.transitions }) }}
    </Badge>

    <Badge
      variant="outline"
      class="text-xs"
      :data-testid="TEST_ID.testSizePolicy"
    >
      {{
        t("lifecycle.sizePolicy", {
          policy: t(`sizePolicy.label.${metadata.sizePolicy}`),
        })
      }}
    </Badge>

    <div
      v-if="metadata.tags.length > 0"
      class="flex flex-wrap items-center gap-1"
      :data-testid="TEST_ID.testTags"
    >
      <Badge
        v-for="tag in metadata.tags"
        :key="tag"
        variant="outline"
        class="font-mono text-[10px]"
      >
        {{ tag }}
      </Badge>
    </div>

    <Badge
      v-if="assignment"
      variant="secondary"
      class="text-xs"
      :data-testid="TEST_ID.assignBadge"
    >
      {{ t("assign.badge", { user: assignment.assigneeUsername }) }}
      <template v-if="assignmentDue">
        · {{ t("assign.due", { date: assignmentDue }) }}
      </template>
      <template v-if="assignment.isOverdue">
        · {{ t("assign.overdue") }}
      </template>
    </Badge>

    <Button
      v-if="canCompleteAssignment && assignment"
      type="button"
      variant="outline"
      size="sm"
      :data-testid="TEST_ID.assignComplete"
      @click="completeAssignment.mutate(assignment.id)"
    >
      {{ t("assign.complete") }}
    </Button>

    <Button
      v-if="canWrite"
      type="button"
      variant="outline"
      size="sm"
      :data-testid="TEST_ID.assignAction"
      @click="assignOpen = true"
    >
      {{ t("assign.action") }}
    </Button>

    <Button
      v-if="canWrite"
      type="button"
      variant="outline"
      size="sm"
      :data-testid="TEST_ID.testEditAction"
      @click="openDialog"
    >
      {{ t("lifecycle.editAction") }}
    </Button>

    <p
      v-if="metadata.description"
      class="w-full text-xs text-muted-foreground"
      :data-testid="TEST_ID.testDescription"
    >
      {{ metadata.description }}
    </p>

    <AssignReviewDialog
      v-if="canWrite && assignOpen"
      :open="assignOpen"
      :project-name="projectName"
      :test-name="testName"
      :branch="branch"
      @update:open="assignOpen = $event"
    />

    <EditTestDialog
      v-if="canWrite"
      :open="dialogOpen"
      :name="metadata.name || testName"
      :description="metadata.description"
      :tags="metadata.tags"
      :muted-until="metadata.mutedUntil"
      :mute-reason="metadata.muteReason"
      :is-muted="metadata.isMuted"
      :size-policy="metadata.sizePolicy"
      :pending="update.isPending.value"
      :error="update.error.value"
      @update:open="dialogOpen = $event"
      @submit="submit"
      @unmute="unmute"
    />
  </div>
</template>
