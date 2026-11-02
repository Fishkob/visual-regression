<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

import Breadcrumbs from "@/components/Breadcrumbs.vue";
import ProjectWebhooksPanel from "@/components/webhooks/ProjectWebhooksPanel.vue";
import ReviewSettingsDialog from "@/components/projects/ReviewSettingsDialog.vue";
import ThresholdSettingsDialog from "@/components/projects/ThresholdSettingsDialog.vue";
import ProjectStoragePanel from "@/components/storage/ProjectStoragePanel.vue";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCurrentRole } from "@/composables/useAuth";
import { useProjectDetailPage } from "@/composables/useProjectDetailPage";
import { useRouteParams } from "@/composables/useRouteParams";
import { TEST_ID } from "@/lib/test-ids";

const { projectName } = useRouteParams();
const { t } = useI18n();
const { isAdmin } = useCurrentRole();

// The page needs the project's review policy, and `requiredApprovals` is only
// carried by the branch-scoped project read. Reusing it keeps the cache entry
// the operator already populated by coming from the project page.
const { project } = useProjectDetailPage(projectName);

const reviewSettingsOpen = ref(false);
const thresholdSettingsOpen = ref(false);
const requiredApprovals = computed(() => project.value?.requiredApprovals ?? 1);
const projectThreshold = computed(
  () => project.value?.pixelDiffThreshold ?? null,
);
</script>

<template>
  <Breadcrumbs
    class="px-6 py-3 text-sm text-muted-foreground"
    :group-name="project?.groupName ?? undefined"
  />

  <div class="space-y-6 p-6" :data-testid="TEST_ID.projectSettingsView">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-xl font-semibold">{{ t("projectSettings.title") }}</h2>
        <Badge variant="secondary" :data-testid="TEST_ID.projectSettingsName">
          {{ project?.name || projectName }}
        </Badge>
      </div>
      <RouterLink
        v-if="projectName"
        :to="{ name: 'project-detail', params: { projectName } }"
        :class="buttonVariants({ variant: 'outline', size: 'sm' })"
        :data-testid="TEST_ID.projectSettingsBack"
      >
        {{ t("projectSettings.backToProject") }}
      </RouterLink>
    </div>

    <p class="text-sm text-muted-foreground">
      {{ t("projectSettings.description") }}
    </p>

    <section class="rounded-xl border bg-card p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 class="font-medium">{{ t("reviewSettings.title") }}</h3>
          <p class="text-sm text-muted-foreground">
            {{ t("reviewSettings.description") }}
          </p>
          <p
            v-if="project"
            class="mt-2 text-sm font-medium"
            :data-testid="TEST_ID.reviewRequiredApprovalsValue"
          >
            {{ t("projectSettings.reviewCurrent", requiredApprovals) }}
          </p>
        </div>
        <Button
          v-if="isAdmin && project"
          type="button"
          variant="outline"
          size="sm"
          :data-testid="TEST_ID.reviewSettingsAction"
          @click="reviewSettingsOpen = true"
        >
          {{ t("reviewSettings.edit") }}
        </Button>
      </div>
    </section>

    <section
      class="rounded-xl border bg-card p-4 shadow-sm"
      :data-testid="TEST_ID.projectThresholdSection"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 class="font-medium">{{ t("thresholdSettings.title") }}</h3>
          <p class="text-sm text-muted-foreground">
            {{ t("thresholdSettings.description") }}
          </p>
          <p
            v-if="project"
            class="mt-2 text-sm font-medium"
            :data-testid="TEST_ID.projectThresholdValue"
          >
            {{
              projectThreshold === null
                ? t("thresholdSettings.none")
                : t("thresholdSettings.current", {
                    threshold: projectThreshold,
                  })
            }}
          </p>
        </div>
        <Button
          v-if="isAdmin && project"
          type="button"
          variant="outline"
          size="sm"
          :data-testid="TEST_ID.thresholdSettingsAction"
          @click="thresholdSettingsOpen = true"
        >
          {{ t("thresholdSettings.edit") }}
        </Button>
      </div>
    </section>

    <ProjectStoragePanel :project-name="projectName" />

    <!-- Endpoint administration is ADMIN-only in the API, so a MEMBER/VIEWER
    session gets no section instead of a failing one. The settings page and the
    dedicated Webhooks page render the same panel. -->
    <section
      v-if="isAdmin"
      id="webhooks"
      class="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
      :data-testid="TEST_ID.projectSettingsWebhooks"
    >
      <div>
        <h3 class="font-medium">{{ t("webhooks.title") }}</h3>
        <p class="text-sm text-muted-foreground">
          {{ t("projectSettings.webhooksDescription") }}
        </p>
      </div>
      <ProjectWebhooksPanel :project-name="projectName" />
    </section>

    <ReviewSettingsDialog
      v-if="reviewSettingsOpen && project"
      :open="reviewSettingsOpen"
      :project-name="projectName"
      :required-approvals="requiredApprovals"
      @update:open="reviewSettingsOpen = $event"
    />

    <ThresholdSettingsDialog
      v-if="thresholdSettingsOpen && project"
      :open="thresholdSettingsOpen"
      :project-name="projectName"
      :pixel-diff-threshold="projectThreshold"
      @update:open="thresholdSettingsOpen = $event"
    />
  </div>
</template>
