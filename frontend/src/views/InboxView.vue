<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AsyncState from "@/components/AsyncState.vue";
import InboxProjectSection from "@/components/inbox/InboxProjectSection.vue";
import { useReviewInboxSections } from "@/composables/useReviewInbox";
import { FILTER_ALL } from "@/domains/test-status";
import { IMAGE_TEST_KIND, PDF_TEST_KIND } from "@/domains/test-kind";
import type { InboxProjectSection as InboxProjectSectionModel } from "@/domains/pending-tests/group-review-inbox";
import { TEST_ID } from "@/lib/test-ids";

const {
  data: items,
  sections,
  isLoading,
  error,
  refetch,
} = useReviewInboxSections();

const route = useRoute();
const router = useRouter();

const search = ref("");
const kind = ref(FILTER_ALL);
const group = ref(FILTER_ALL);

// The branch filter is part of the review scope, not a local view preference:
// the review loop hands it back on "return to inbox" and a deep link must
// restore it. It therefore lives in the URL (the other filters stay local).
const branch = computed<string>({
  get: () => {
    const requested = route.query.branch;
    return typeof requested === "string" && requested ? requested : FILTER_ALL;
  },
  set: (value: string) => {
    const query = { ...route.query };
    if (!value || value === FILTER_ALL) {
      delete query.branch;
    } else {
      query.branch = value;
    }
    void router.replace({ query });
  },
});

const groups = computed(() =>
  sections.value.map((section) => ({
    key: section.key,
    name: section.name,
  })),
);

// The unfiltered project sections: the review pass walks a project's pending
// list, so its count must not be narrowed by the inbox filters above.
const fullProjects = computed(() => {
  const projects = new Map<string, InboxProjectSectionModel>();
  for (const section of sections.value) {
    for (const project of section.items) {
      projects.set(project.projectName, project);
    }
  }
  return projects;
});

const branches = computed(() => {
  const names = [
    ...new Set((items.value ?? []).map((item) => item.branchName)),
  ];
  // Keep a deep-linked / handed-back branch selectable even when its last
  // pending item is gone, so the filter does not look broken.
  const selected = branch.value;
  if (selected !== FILTER_ALL && !names.includes(selected)) {
    names.push(selected);
  }
  return names;
});

const filteredSections = computed(() => {
  const term = search.value.toLowerCase();
  const wantedGroup = group.value;
  const wantedKind = kind.value;
  const wantedBranch = branch.value;
  return sections.value
    .filter(
      (section) => wantedGroup === FILTER_ALL || section.key === wantedGroup,
    )
    .map((section) => ({
      ...section,
      items: section.items
        .map((project) => ({
          ...project,
          items: project.items.filter(
            (item) =>
              (wantedKind === FILTER_ALL || item.kind === wantedKind) &&
              (wantedBranch === FILTER_ALL ||
                item.branchName === wantedBranch) &&
              (!term ||
                item.testName.toLowerCase().includes(term) ||
                project.projectName.toLowerCase().includes(term)),
          ),
        }))
        .filter((project) => project.items.length > 0),
    }))
    .filter((section) => section.items.length > 0);
});

const total = computed(() =>
  filteredSections.value.reduce(
    (sum, section) =>
      sum +
      section.items.reduce(
        (projectSum, project) => projectSum + project.items.length,
        0,
      ),
    0,
  ),
);
const projectCount = computed(() =>
  filteredSections.value.reduce(
    (sum, section) => sum + section.items.length,
    0,
  ),
);
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.reviewInbox">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Review inbox</h1>
      <p v-if="isLoading" class="text-sm text-muted-foreground">
        Loading review inbox…
      </p>
      <p v-else-if="!error" class="text-sm text-muted-foreground">
        {{ total }} {{ total === 1 ? "change" : "changes" }} to review across
        {{ projectCount }} {{ projectCount === 1 ? "project" : "projects" }}
      </p>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load review inbox"
      :retry="refetch"
      :empty="!isLoading && (items ?? []).length === 0"
    >
      <template #loading>
        <div class="space-y-6" aria-hidden="true">
          <section v-for="i in 3" :key="i" class="space-y-2">
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-2">
                <div class="h-4 w-32 animate-pulse rounded bg-muted" />
                <div class="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
            </div>
            <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div
                v-for="row in 2"
                :key="row"
                class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
              >
                <div class="space-y-2">
                  <div class="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div class="h-3 w-28 animate-pulse rounded bg-muted" />
                </div>
                <div class="flex gap-2">
                  <div class="h-5 w-14 animate-pulse rounded bg-muted" />
                  <div class="h-5 w-16 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>

      <template #empty>
        <div class="space-y-3 py-12 text-center">
          <h2 class="text-lg font-medium">All caught up</h2>
          <p class="text-sm text-muted-foreground">
            There are no pending reviews right now.
          </p>
          <RouterLink
            to="/projects"
            class="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Browse projects
          </RouterLink>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model="search"
          placeholder="Search test or project..."
          aria-label="Search pending reviews"
          class="w-64 rounded-xl shadow-sm"
          :data-testid="TEST_ID.inboxSearch"
        />
        <Select v-model="kind">
          <SelectTrigger
            class="w-40"
            aria-label="Filter by kind"
            :data-testid="TEST_ID.inboxFilterKind"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All kinds</SelectItem>
            <SelectItem :value="IMAGE_TEST_KIND">Images</SelectItem>
            <SelectItem :value="PDF_TEST_KIND">PDFs</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="branch">
          <SelectTrigger
            class="w-44"
            aria-label="Filter by branch"
            :data-testid="TEST_ID.inboxFilterBranch"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All branches</SelectItem>
            <SelectItem
              v-for="branchOption in branches"
              :key="branchOption"
              :value="branchOption"
            >
              {{ branchOption }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="group">
          <SelectTrigger
            class="w-48"
            aria-label="Filter by group"
            :data-testid="TEST_ID.filterGroup"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All groups</SelectItem>
            <SelectItem
              v-for="groupOption in groups"
              :key="groupOption.key"
              :value="groupOption.key"
            >
              {{ groupOption.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="total === 0"
        class="py-12 text-center text-sm text-muted-foreground"
      >
        No pending reviews match these filters.
      </div>

      <div
        v-for="section in filteredSections"
        :key="section.key"
        class="space-y-4"
      >
        <h2 class="text-sm font-semibold text-muted-foreground">
          {{ section.name }}
        </h2>
        <InboxProjectSection
          v-for="project in section.items"
          :key="project.projectName"
          :section="project"
          :project-section="fullProjects.get(project.projectName)"
        />
      </div>
    </AsyncState>
  </div>
</template>
