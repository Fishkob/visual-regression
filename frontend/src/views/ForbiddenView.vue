<template>
  <div
    class="mx-auto max-w-md space-y-3 py-16 text-center"
    :data-testid="TEST_ID.forbiddenView"
  >
    <h1 class="text-xl font-semibold tracking-tight">
      {{ t("forbidden.title") }}
    </h1>
    <p class="text-sm text-muted-foreground">
      {{ t("forbidden.body") }}
    </p>
    <RouterLink
      to="/"
      class="text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {{ t("forbidden.back") }}
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();
</script>
