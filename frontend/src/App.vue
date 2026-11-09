<template>
  <RouterView v-if="isPublicPage" />
  <AppShell v-else />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppShell from "@/components/AppShell.vue";
import { useDocumentTitle } from "@/composables/useDocumentTitle";

const route = useRoute();
useDocumentTitle();

// Public pages are deliberately outside the dashboard chrome: no sidebar,
// header or navigation to a signed-in area. A share link is read-only evidence
// for someone without an account; an invite link is the only way into an
// account that has no password yet.
const PUBLIC_ROUTES = new Set(["share", "invite"]);
const isPublicPage = computed(
  () => typeof route.name === "string" && PUBLIC_ROUTES.has(route.name),
);
</script>
