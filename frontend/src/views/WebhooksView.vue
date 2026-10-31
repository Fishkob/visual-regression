<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ProjectWebhooksPanel from "@/components/webhooks/ProjectWebhooksPanel.vue";
import { useRouteParams } from "@/composables/useRouteParams";
import { TEST_ID } from "@/lib/test-ids";

const { projectName } = useRouteParams();
const { t } = useI18n();
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.webhooksView">
    <div>
      <p class="text-sm text-muted-foreground">{{ projectName }}</p>
      <h1 class="text-xl font-semibold tracking-tight">
        {{ t("webhooks.title") }}
      </h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        {{ t("webhooks.subtitle") }}
      </p>
    </div>

    <ProjectWebhooksPanel :project-name="projectName" />
  </div>
</template>
