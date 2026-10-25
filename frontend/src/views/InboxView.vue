<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
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
import PaginationBar from "@/components/PaginationBar.vue";
import {
  useInboxBranchesQuery,
  useReviewInboxSections,
} from "@/composables/useReviewInbox";
import { useGroupsQuery } from "@/composables/useGroups";
import { FILTER_ALL } from "@/domains/test-status";
import {
  IMAGE_TEST_KIND,
  PDF_TEST_KIND,
  isTestKind,
  type TestKind,
} from "@/domains/test-kind";
import { UNASSIGNED_GROUP_QUERY } from "@/domains/groups/group-section";
import type { InboxListQuery } from "@/domains/pending-tests/query-keys";
import { INBOX_PAGE_SIZE } from "@/lib/pagination";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const router = useRouter();

const page = computed({
  get: () => {
    const raw = Number(route.query.page ?? 1);
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  },
  set: (value: number) => {
    const query = { ...route.query };
    if (value <= 1) delete query.page;
    else query.page = String(value);
    void router.replace({ query });
  },
});

// The branch filter is part of the review scope, not a local view preference:
// the review loop hands it back on "return to inbox" and a deep link must
// restore it. It therefore lives in the URL.
const branch = computed<string>({
  get: () => {
    const requested = route.query.branch;
    return typeof requested === "string" && requested ? requested : FILTER_ALL;
  },
  set: (value: string) => {
    const query = { ...route.query };
    if (!value || value === FILTER_ALL) delete query.branch;
    else query.branch = value;
    delete query.page;
    void router.replace({ query });
  },
});

// Kind and group are part of the same review scope as the branch: the review
// loop hands them back on "return to inbox", so they live in the URL too and a
// deep link or refresh restores the filtered pass.
const kind = computed<TestKind | typeof FILTER_ALL>({
  get: () => {
    const requested = route.query.kind;
    return typeof requested === "string" && isTestKind(requested)
      ? requested
      : FILTER_ALL;
  },
  set: (value: TestKind | typeof FILTER_ALL) => {
    const query = { ...route.query };
    if (value === FILTER_ALL) delete query.kind;
    else query.kind = value;
    delete query.page;
    void router.replace({ query });
  },
});

const group = computed<string>({
  get: () => {
    const requested = route.query.group;
    return typeof requested === "string" && requested ? requested : FILTER_ALL;
  },
  set: (value: string) => {
    const query = { ...route.query };
    if (!value || value === FILTER_ALL) delete query.group;
    else query.group = value;
    delete query.page;
    void router.replace({ query });
  },
});

// Local input, debounced query value: the server does the searching, so an
// un-debounced input would issue one request per keystroke.
const searchInput = ref("");
const searchQuery = ref("");
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery.value = value;
    if (page.value !== 1) page.value = 1;
  }, 300);
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

const queryParams = computed<InboxListQuery>(() => ({
  page: page.value,
  ...(searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {}),
  ...(kind.value !== FILTER_ALL ? { kind: kind.value } : {}),
  ...(group.value !== FILTER_ALL ? { groupId: group.value } : {}),
  ...(branch.value !== FILTER_ALL ? { branch: branch.value } : {}),
}));

const { items, sections, total, isLoading, error, refetch } =
  useReviewInboxSections(queryParams);

// The group/branch choices must describe the whole pending set, not the page.
const { data: groupsData } = useGroupsQuery();
const { data: branchData } = useInboxBranchesQuery();

const groupOptions = computed(() => [
  ...(groupsData.value ?? []).map((entry) => ({
    value: entry.id,
    label: entry.name,
  })),
  { value: UNASSIGNED_GROUP_QUERY, label: "Unassigned" },
]);

const branchOptions = computed(() => {
  const names = [...(branchData.value ?? [])];
  if (branch.value !== FILTER_ALL && !names.includes(branch.value)) {
    names.push(branch.value);
  }
  return names;
});

const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / INBOX_PAGE_SIZE)),
);

watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

const hasActiveFilters = computed(
  () =>
    searchQuery.value.trim().length > 0 ||
    kind.value !== FILTER_ALL ||
    group.value !== FILTER_ALL ||
    branch.value !== FILTER_ALL,
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
        {{ total }} {{ total === 1 ? "change" : "changes" }} to review
      </p>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load review inbox"
      :retry="refetch"
      :empty="!isLoading && items.length === 0 && !hasActiveFilters"
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
          v-model="searchInput"
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
              v-for="branchOption in branchOptions"
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
              v-for="groupOption in groupOptions"
              :key="groupOption.value"
              :value="groupOption.value"
            >
              {{ groupOption.label }}
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

      <div v-for="section in sections" :key="section.key" class="space-y-4">
        <h2 class="text-sm font-semibold text-muted-foreground">
          {{ section.name }}
        </h2>
        <InboxProjectSection
          v-for="project in section.items"
          :key="project.projectName"
          :section="project"
        />
      </div>

      <PaginationBar
        v-if="pageCount > 1"
        :page="page"
        :page-count="pageCount"
        :total="total"
        item-label="changes"
        @update:page="page = $event"
      />
    </AsyncState>
  </div>
</template>
