<template>
  <div
    class="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4"
  >
    <h1 class="text-3xl font-bold">404</h1>

    <p class="text-muted-foreground">
      The page you’re looking for doesn’t exist.
    </p>

    <Button
      type="button"
      @click="goHome"
      :data-testid="TEST_ID.backToProjectList"
    >
      Back to project list
    </Button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";

const router = useRouter();

function goHome() {
  router.push({ name: "project-list" });
}
</script>
