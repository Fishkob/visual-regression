<template>
  <div
    class="mx-auto max-w-md space-y-3 py-16 text-center"
    :data-testid="TEST_ID.forbiddenView"
  >
    <h1 class="text-xl font-semibold tracking-tight">Not allowed</h1>
    <p class="text-sm text-muted-foreground">
      Your role does not have access to this page. Ask an administrator if you
      think this is a mistake.
    </p>
    <RouterLink
      to="/"
      class="text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      Back to the review inbox
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { TEST_ID } from "@/lib/test-ids";
</script>
