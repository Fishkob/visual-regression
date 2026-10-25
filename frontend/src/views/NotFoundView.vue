<template>
  <div
    class="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4"
  >
    <h1 class="text-3xl font-bold">404</h1>

    <p class="text-muted-foreground">
      {{ t("notFound.message") }}
    </p>

    <Button
      type="button"
      @click="goHome"
      :data-testid="TEST_ID.backToProjectList"
    >
      {{ t("notFound.back") }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";

const router = useRouter();
const { t } = useI18n();

function goHome() {
  router.push({ name: "project-list" });
}
</script>
