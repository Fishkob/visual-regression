<template>
  <RouterView v-if="isPublicShare" />
  <AppShell v-else />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppShell from "@/components/AppShell.vue";

const route = useRoute();
// Shared pages are public and deliberately outside the dashboard chrome: no
// sidebar, header or navigation to a signed-in area.
const isPublicShare = computed(() => route.name === "share");
</script>
