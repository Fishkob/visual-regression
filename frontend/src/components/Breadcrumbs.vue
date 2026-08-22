<script setup lang="ts">
import { computed } from "vue";
import { useRoute, RouterLink } from "vue-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const route = useRoute();

const projectName = computed(
  () => route.params.projectName as string | undefined,
);
const testName = computed(() => route.params.testName as string | undefined);

const hasProject = computed(() => !!projectName.value);
const hasTest = computed(() => !!testName.value);
</script>

<template>
  <Breadcrumb>
    <BreadcrumbList>
      <!-- Home / Projects -->
      <BreadcrumbItem>
        <BreadcrumbLink as-child>
          <RouterLink :to="{ name: 'project-list' }">Project</RouterLink>
        </BreadcrumbLink>
      </BreadcrumbItem>

      <!-- ProjectName -->
      <template v-if="hasProject">
        <BreadcrumbSeparator />

        <BreadcrumbItem>
          <BreadcrumbLink as-child>
            <RouterLink
              :to="{
                name: 'project-detail',
                params: { projectName: projectName ?? '' },
              }"
            >
              {{ projectName }}
            </RouterLink>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </template>

      <!-- TestName -->
      <template v-if="hasTest">
        <BreadcrumbSeparator />

        <BreadcrumbItem>
          <BreadcrumbPage>{{ testName }}</BreadcrumbPage>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
