<template>
  <div
    class="flex flex-col items-center justify-center mt-24 text-center space-y-4"
  >
    <CheckCircle class="w-12 h-12 text-green-500" />

    <h1 class="text-xl font-semibold">All comparisons reviewed</h1>

    <p class="text-muted-foreground">
      You’ve completed all pending approvals for this project.
    </p>

    <Button type="button" @click="goHome" class="mt-4">
      Back to project list
    </Button>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useRouter } from "vue-router";

const router = useRouter();

function goHome() {
  router.push({ name: "project-list" });
}
</script>
