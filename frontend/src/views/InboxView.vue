<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
import BulkFailureDialog from "@/components/bulk-actions/BulkFailureDialog.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import InboxProjectSection from "@/components/inbox/InboxProjectSection.vue";
import PaginationBar from "@/components/PaginationBar.vue";
import { Button } from "@/components/ui/button";
import { useCurrentRole } from "@/composables/useAuth";
import { useBulkApproveSelection } from "@/composables/useBulkActions";
import { useBulkSelection } from "@/composables/useBulkSelection";
import {
  useInboxBranchesQuery,
  useReviewInboxSections,
} from "@/composables/useReviewInbox";
import { useGroupsQuery } from "@/composables/useGroups";
import {
  bulkFailureRows,
  type BulkApproveSelection,
  type BulkFailureRow,
} from "@/domains/bulk-actions/bulk-action.model";
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
const { t } = useI18n();

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

// The run filter is the same shape as the search box — free text answered by the
// server — so it debounces too, and applying a new run key returns to the first
// page because the previous page may not exist for the narrower queue.
const runInput = ref("");
const runFilter = ref("");
let runTimer: ReturnType<typeof setTimeout> | undefined;

watch(runInput, (value) => {
  if (runTimer) clearTimeout(runTimer);
  runTimer = setTimeout(() => {
    runFilter.value = value.trim();
    if (page.value !== 1) page.value = 1;
  }, 300);
});

// The tag filter is answered server-side like the other text filters, so it
// debounces and resets the page when a new tag is applied.
const tagInput = ref("");
const tagFilter = ref("");
let tagTimer: ReturnType<typeof setTimeout> | undefined;

watch(tagInput, (value) => {
  if (tagTimer) clearTimeout(tagTimer);
  tagTimer = setTimeout(() => {
    tagFilter.value = value.trim().toLowerCase();
    if (page.value !== 1) page.value = 1;
  }, 300);
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  if (runTimer) clearTimeout(runTimer);
  if (tagTimer) clearTimeout(tagTimer);
});

const queryParams = computed<InboxListQuery>(() => ({
  page: page.value,
  ...(searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {}),
  ...(kind.value !== FILTER_ALL ? { kind: kind.value } : {}),
  ...(group.value !== FILTER_ALL ? { groupId: group.value } : {}),
  ...(branch.value !== FILTER_ALL ? { branch: branch.value } : {}),
  ...(runFilter.value ? { runKey: runFilter.value } : {}),
  ...(tagFilter.value ? { tag: tagFilter.value } : {}),
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
  { value: UNASSIGNED_GROUP_QUERY, label: t("inbox.unassigned") },
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
    branch.value !== FILTER_ALL ||
    runFilter.value.length > 0 ||
    tagFilter.value.length > 0,
);

// Bulk selection is a writer tool: a VIEWER sees the queue and can walk it, but
// gets no checkboxes or bulk bar (the backend would answer 403 anyway).
const { canWrite } = useCurrentRole();
const bulkApprove = useBulkApproveSelection();
const {
  selectedIds,
  count: selectedCount,
  isSelected,
  toggle: toggleSelection,
  selectAll,
  clear: clearSelection,
  prune: pruneSelection,
} = useBulkSelection();

const pageComparisonIds = computed(() =>
  items.value.map((item) => item.comparisonId),
);
const allSelected = computed(
  () => items.value.length > 0 && selectedCount.value === items.value.length,
);

// A refetch, a page change or a filter can remove rows; a stale id must never be
// submitted by a later bulk approval.
watch(pageComparisonIds, (ids) => pruneSelection(ids));

function toggleAllSelection() {
  if (allSelected.value) clearSelection();
  else selectAll(pageComparisonIds.value);
}

const selectedItems = computed(() =>
  items.value.filter((item) => isSelected(item.comparisonId)),
);

// The endpoint is per project, so the selection is grouped by project and sent
// as one request per group; the composable merges the per-project answers.
const approveSelections = computed<BulkApproveSelection[]>(() => {
  const byProject = new Map<string, string[]>();
  for (const item of selectedItems.value) {
    const ids = byProject.get(item.projectName) ?? [];
    ids.push(item.comparisonId);
    byProject.set(item.projectName, ids);
  }
  return [...byProject.entries()].map(([projectName, comparisonIds]) => ({
    projectName,
    comparisonIds,
  }));
});
const selectedProjectCount = computed(() => approveSelections.value.length);
const approveScopeLabel = computed(
  () =>
    `${t("inbox.selectedChanges", selectedCount.value)} ${t(
      "inbox.acrossProjects",
      selectedProjectCount.value,
    )}`,
);

const approveOpen = ref(false);
const failureOpen = ref(false);
const failureRows = ref<BulkFailureRow[]>([]);

function confirmBulkApprove() {
  // Capture the labels before the mutation: the refreshed inbox may no longer
  // contain the failed rows, and the dialog must still name them.
  const labels = new Map(
    selectedItems.value.map((item) => [
      item.comparisonId,
      `${item.projectName} · ${item.testName}`,
    ]),
  );
  bulkApprove.mutate(approveSelections.value, {
    onSuccess: (result) => {
      clearSelection();
      if (result.failed.length > 0) {
        failureRows.value = bulkFailureRows(result.failed, labels);
        failureOpen.value = true;
      }
    },
  });
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.reviewInbox">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">
        {{ t("inbox.title") }}
      </h1>
      <p v-if="isLoading" class="text-sm text-muted-foreground">
        {{ t("inbox.loading") }}
      </p>
      <p v-else-if="!error" class="text-sm text-muted-foreground">
        {{ t("inbox.toReview", total) }}
      </p>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('inbox.errorTitle')"
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
          <h2 class="text-lg font-medium">{{ t("inbox.emptyTitle") }}</h2>
          <p class="text-sm text-muted-foreground">
            {{ t("inbox.emptyBody") }}
          </p>
          <RouterLink
            to="/projects"
            class="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {{ t("inbox.browseProjects") }}
          </RouterLink>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model="searchInput"
          :placeholder="t('inbox.searchPlaceholder')"
          :aria-label="t('inbox.searchLabel')"
          class="w-64 rounded-xl shadow-sm"
          :data-testid="TEST_ID.inboxSearch"
        />
        <Input
          v-model="runInput"
          :placeholder="t('inbox.runPlaceholder')"
          :aria-label="t('inbox.runLabel')"
          class="w-48 rounded-xl shadow-sm"
          :data-testid="TEST_ID.inboxRunFilter"
        />
        <Input
          v-model="tagInput"
          :placeholder="t('inbox.tagPlaceholder')"
          :aria-label="t('inbox.tagLabel')"
          class="w-44 rounded-xl shadow-sm"
          :data-testid="TEST_ID.inboxTagFilter"
        />
        <Select v-model="kind">
          <SelectTrigger
            class="w-40"
            :aria-label="t('inbox.kindLabel')"
            :data-testid="TEST_ID.inboxFilterKind"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("inbox.allKinds")
            }}</SelectItem>
            <SelectItem :value="IMAGE_TEST_KIND">{{
              t("inbox.images")
            }}</SelectItem>
            <SelectItem :value="PDF_TEST_KIND">{{
              t("inbox.pdfs")
            }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="branch">
          <SelectTrigger
            class="w-44"
            :aria-label="t('inbox.branchLabel')"
            :data-testid="TEST_ID.inboxFilterBranch"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("inbox.allBranches")
            }}</SelectItem>
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
            :aria-label="t('inbox.groupLabel')"
            :data-testid="TEST_ID.filterGroup"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("inbox.allGroups")
            }}</SelectItem>
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
        v-if="canWrite && items.length > 0"
        class="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-2 shadow-sm"
        :data-testid="TEST_ID.inboxBulkBar"
      >
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="h-4 w-4"
            :checked="allSelected"
            :aria-label="
              allSelected ? t('inbox.selectAll') : t('inbox.selectAllLabel')
            "
            :data-testid="TEST_ID.inboxSelectAll"
            @change="toggleAllSelection"
          />
          <span>{{ t("inbox.selectAllText") }}</span>
        </label>
        <span class="text-sm text-muted-foreground">
          {{ t("inbox.selected", selectedCount) }}
        </span>
        <Button
          type="button"
          size="sm"
          :disabled="selectedCount === 0 || bulkApprove.isPending.value"
          :data-testid="TEST_ID.inboxBulkApprove"
          @click="approveOpen = true"
        >
          {{ t("inbox.approveSelected") }}
        </Button>
      </div>

      <div
        v-if="total === 0"
        class="py-12 text-center text-sm text-muted-foreground"
      >
        {{ t("inbox.noMatch") }}
      </div>

      <div v-for="section in sections" :key="section.key" class="space-y-4">
        <h2 class="text-sm font-semibold text-muted-foreground">
          {{ section.name }}
        </h2>
        <InboxProjectSection
          v-for="project in section.items"
          :key="project.projectName"
          :section="project"
          :selectable="canWrite"
          :selected-ids="selectedIds"
          @toggle="toggleSelection"
        />
      </div>

      <PaginationBar
        v-if="pageCount > 1"
        :page="page"
        :page-count="pageCount"
        :total="total"
        :item-label="t('pagination.changes')"
        @update:page="page = $event"
      />
    </AsyncState>

    <ConfirmDialog
      :open="approveOpen"
      :pending="bulkApprove.isPending.value"
      :title="t('inbox.approveDialogTitle')"
      :description="
        t('inbox.approveDialogDescription', { scope: approveScopeLabel })
      "
      :confirm-text="t('inbox.approveSelected')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmBulkApprove"
      @cancel="approveOpen = false"
      @update:open="approveOpen = $event"
    />

    <BulkFailureDialog
      :open="failureOpen"
      :rows="failureRows"
      :title="t('inbox.failureTitle')"
      :description="t('inbox.failureBody')"
      @update:open="failureOpen = $event"
    />
  </div>
</template>
