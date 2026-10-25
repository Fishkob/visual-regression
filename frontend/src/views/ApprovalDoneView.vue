<template>
  <div
    class="flex flex-col items-center justify-center mt-24 text-center space-y-4"
  >
    <CheckCircle class="w-12 h-12 text-status-success" />

    <h1 class="text-xl font-semibold" :data-testid="TEST_ID.doneHeading">
      {{ t("approvalDone.heading") }}
    </h1>

    <p class="text-muted-foreground">
      {{
        branch
          ? t("approvalDone.branchDone", { branch })
          : t("approvalDone.projectDone")
      }}
    </p>

    <Button
      type="button"
      @click="goHome"
      class="mt-4"
      :data-testid="TEST_ID.backToProjectList"
    >
      {{ t("approvalDone.back") }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { CheckCircle } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useRoute, useRouter } from "vue-router";
import { TEST_ID } from "@/lib/test-ids";

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

// The review pass is branch-scoped, so "done" must not claim project-wide
// completion when it only finished one branch.
const branch = computed(() =>
  typeof route.query.branch === "string" && route.query.branch
    ? route.query.branch
    : undefined,
);

function goHome() {
  router.push({ name: "project-list" });
}
</script>
