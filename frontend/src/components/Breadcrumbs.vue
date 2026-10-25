<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, RouterLink } from "vue-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{ groupName?: string }>();

const { t } = useI18n();
const route = useRoute();

const projectName = computed(
  () => route.params.projectName as string | undefined,
);
const testName = computed(() => route.params.testName as string | undefined);

const hasProject = computed(() => !!projectName.value);
const hasTest = computed(() => !!testName.value);

// The crumb is the primary "up" navigation, so it must not silently drop the
// branch: a `to` object without a query replaces the whole query string, which
// would land a reviewer on the project default branch mid-review.
const branch = computed(() =>
  typeof route.query.branch === "string" && route.query.branch
    ? route.query.branch
    : undefined,
);
</script>

<template>
  <Breadcrumb>
    <BreadcrumbList>
      <!-- Home / Projects -->
      <BreadcrumbItem>
        <BreadcrumbLink as-child>
          <RouterLink :to="{ name: 'project-list' }">{{
            t("nav.projects")
          }}</RouterLink>
        </BreadcrumbLink>
      </BreadcrumbItem>

      <!-- GroupName -->
      <template v-if="groupName">
        <BreadcrumbSeparator />

        <BreadcrumbItem>
          <span
            class="text-muted-foreground"
            :data-testid="TEST_ID.breadcrumbGroup"
          >
            {{ groupName }}
          </span>
        </BreadcrumbItem>
      </template>

      <!-- ProjectName -->
      <template v-if="hasProject">
        <BreadcrumbSeparator />

        <BreadcrumbItem>
          <BreadcrumbLink as-child>
            <RouterLink
              :to="{
                name: 'project-detail',
                params: { projectName: projectName ?? '' },
                ...(branch ? { query: { branch } } : {}),
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
