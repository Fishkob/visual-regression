<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import Breadcrumbs from "@/components/Breadcrumbs.vue";
import ProjectWebhooksPanel from "@/components/webhooks/ProjectWebhooksPanel.vue";
import RenameProjectDialog from "@/components/projects/RenameProjectDialog.vue";
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
const { isAdmin, canWrite } = useCurrentRole();
const route = useRoute();
const router = useRouter();

// The page needs the project's threshold, and `pixelDiffThreshold` is only
// carried by the branch-scoped project read. Reusing it keeps the cache entry
// the operator already populated by coming from the project page.
const { project } = useProjectDetailPage(projectName);

const thresholdSettingsOpen = ref(false);
const renameOpen = ref(false);
const projectThreshold = computed(
  () => project.value?.pixelDiffThreshold ?? null,
);

// A rename changes the route identity, so the settings page continues under the
// new name instead of rendering the old project: the branch and query survive,
// the same way a test rename keeps its variant.
function handleRenamed(name: string) {
  renameOpen.value = false;
  if (!name || name === projectName.value) return;
  void router.replace({
    name: typeof route.name === "string" ? route.name : "project-settings",
    params: { ...route.params, projectName: name },
    query: route.query,
  });
}
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

    <!-- The name is the project's address, so it sits above the policy
    sections: everything below hangs off this identity. -->
    <section
      class="rounded-xl border bg-card p-4 shadow-sm"
      :data-testid="TEST_ID.projectRenameSection"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 class="font-medium">{{ t("projectSettings.nameTitle") }}</h3>
          <p class="text-sm text-muted-foreground">
            {{ t("projectSettings.nameDescription") }}
          </p>
          <p
            class="mt-2 font-mono text-sm font-medium"
            :data-testid="TEST_ID.projectRenameCurrent"
          >
            {{ project?.name || projectName }}
          </p>
        </div>
        <Button
          v-if="project && canWrite"
          type="button"
          variant="outline"
          size="sm"
          :data-testid="TEST_ID.projectRenameAction"
          @click="renameOpen = true"
        >
          {{ t("renameProject.action") }}
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

    <ThresholdSettingsDialog
      v-if="thresholdSettingsOpen && project"
      :open="thresholdSettingsOpen"
      :project-name="projectName"
      :pixel-diff-threshold="projectThreshold"
      @update:open="thresholdSettingsOpen = $event"
    />

    <RenameProjectDialog
      v-if="renameOpen"
      :open="renameOpen"
      :project-name="projectName"
      @update:open="renameOpen = $event"
      @renamed="handleRenamed"
    />
  </div>
</template>
