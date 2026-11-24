<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Users } from "@lucide/vue";
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
import { useCurrentRole, useMeQuery } from "@/composables/useAuth";
import { useTeamsQuery } from "@/composables/useTeams";
import { useBulkApproveSelection } from "@/composables/useBulkActions";
import { useBulkSelection } from "@/composables/useBulkSelection";
import {
  useInboxBranchesQuery,
  useReviewInboxSections,
} from "@/composables/useReviewInbox";
import { useOverdueAssignmentsQuery } from "@/composables/useAssignments";
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
import type { InboxListQuery } from "@/domains/pending-tests/query-keys";
import { INBOX_PAGE_SIZE } from "@/lib/pagination";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
// One read for the whole page: what this role may do (`canWrite`), how much it
// sees (`seesAllProjects`) and which teams it belongs to (`me.teams`).
const { isAdmin, canWrite, seesAllProjects } = useCurrentRole();
const { data: me } = useMeQuery();

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

// Kind is part of the same review scope as the branch: the review loop hands it
// back on "return to inbox", so it lives in the URL too and a deep link or
// refresh restores the filtered pass.
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

// The team lens (ADR-082) rides in the URL like the rest of the review scope: a
// deep link and the review loop's "return to inbox" both restore it. It narrows
// within the caller's own project scope; naming a foreign team matches nothing.
const team = computed<string>({
  get: () => {
    const requested = route.query.team;
    return typeof requested === "string" && requested ? requested : FILTER_ALL;
  },
  set: (value: string) => {
    const query = { ...route.query };
    if (!value || value === FILTER_ALL) delete query.team;
    else query.team = value;
    delete query.page;
    void router.replace({ query });
  },
});

// The free-text filters are part of the review scope, not a local preference:
// the pass started from a filtered inbox must walk the same set, so the values
// live in the URL like branch and kind. The input stays local (and debounced)
// so typing does not push a history entry per keystroke.
function setFilterQuery(key: "q" | "runKey" | "tag", value: string): void {
  const query = { ...route.query };
  if (value) query[key] = value;
  else delete query[key];
  delete query.page;
  void router.replace({ query });
}

const searchQuery = computed(() =>
  typeof route.query.q === "string" ? route.query.q : "",
);
const searchInput = ref(searchQuery.value);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setFilterQuery("q", value.trim()), 300);
});
watch(searchQuery, (value) => {
  if (searchInput.value.trim() !== value) searchInput.value = value;
});

const runFilter = computed(() =>
  typeof route.query.runKey === "string" ? route.query.runKey : "",
);
const runInput = ref(runFilter.value);
let runTimer: ReturnType<typeof setTimeout> | undefined;
watch(runInput, (value) => {
  if (runTimer) clearTimeout(runTimer);
  runTimer = setTimeout(() => setFilterQuery("runKey", value.trim()), 300);
});
watch(runFilter, (value) => {
  if (runInput.value.trim() !== value) runInput.value = value;
});

const tagFilter = computed(() =>
  typeof route.query.tag === "string" ? route.query.tag : "",
);
const tagInput = ref(tagFilter.value);
let tagTimer: ReturnType<typeof setTimeout> | undefined;
watch(tagInput, (value) => {
  if (tagTimer) clearTimeout(tagTimer);
  tagTimer = setTimeout(
    () => setFilterQuery("tag", value.trim().toLowerCase()),
    300,
  );
});
watch(tagFilter, (value) => {
  if (tagInput.value.trim() !== value) tagInput.value = value;
});

// "My reviews" is review scope, not a local toggle: it narrows the server query,
// the pass it starts and the count that describes that pass, so it lives in the
// URL like the branch and kind filters. A refresh, a deep link and the review
// loop's "back to inbox" leg therefore all restore the same assigned queue.
const assignedToMe = computed<boolean>({
  get: () => route.query.assignedToMe === "1",
  set: (value: boolean) => {
    const query = { ...route.query };
    if (value) query.assignedToMe = "1";
    else delete query.assignedToMe;
    delete query.page;
    void router.replace({ query });
  },
});

const { data: overdueAssignments } = useOverdueAssignmentsQuery();
const overdueCount = computed(() => overdueAssignments.value?.length ?? 0);

function toggleAssignedToMe(event: Event): void {
  assignedToMe.value = (event.target as HTMLInputElement).checked;
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  if (runTimer) clearTimeout(runTimer);
  if (tagTimer) clearTimeout(tagTimer);
});

const queryParams = computed<InboxListQuery>(() => ({
  page: page.value,
  ...(searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {}),
  ...(kind.value !== FILTER_ALL ? { kind: kind.value } : {}),
  ...(branch.value !== FILTER_ALL ? { branch: branch.value } : {}),
  ...(runFilter.value ? { runKey: runFilter.value } : {}),
  ...(tagFilter.value ? { tag: tagFilter.value } : {}),
  ...(assignedToMe.value ? { assignedToMe: true } : {}),
  ...(team.value !== FILTER_ALL ? { teamId: team.value } : {}),
}));

const { items, sections, total, isLoading, error, refetch } =
  useReviewInboxSections(queryParams);

// The branch choices must describe the whole pending set, not the page.
const { data: branchData } = useInboxBranchesQuery(
  computed(() => (team.value === FILTER_ALL ? undefined : team.value)),
);

// An admin may walk one team's queue; everyone else only has its own teams to
// choose from, and `/auth/me` already carries them.
const { data: teamsData } = useTeamsQuery(isAdmin);
const teamOptions = computed(() =>
  isAdmin.value
    ? (teamsData.value ?? []).map((entry) => ({
        value: entry.id,
        label: entry.name,
      }))
    : (me.value?.teams ?? []).map((entry) => ({
        value: entry.id,
        label: entry.name,
      })),
);

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
    branch.value !== FILTER_ALL ||
    team.value !== FILTER_ALL ||
    runFilter.value.length > 0 ||
    tagFilter.value.length > 0 ||
    assignedToMe.value,
);

// Bulk selection is a writer tool: a VIEWER sees the queue and can walk it, but
// gets no checkboxes or bulk bar (the backend would answer 403 anyway).
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
          <!-- "Nothing to do" is only true for a principal that can see the
          whole installation; a team-scoped inbox may be empty because its team
          has no projects yet (ADR-082). -->
          <p
            v-if="!seesAllProjects"
            class="text-sm text-muted-foreground"
            :data-testid="TEST_ID.inboxScopedEmpty"
          >
            {{ t("inbox.emptyScopedBody") }}
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
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="h-4 w-4"
            :checked="assignedToMe"
            :aria-label="t('inbox.assignedToMeLabel')"
            :data-testid="TEST_ID.inboxAssignedToMe"
            @change="toggleAssignedToMe"
          />
          <span>{{ t("inbox.myReviews") }}</span>
        </label>
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
        <!-- The team lens is offered only where there is something to choose:
        one team is no choice, and an unscoped principal already sees the whole
        installation. -->
        <Select v-if="teamOptions.length > 1" v-model="team">
          <SelectTrigger
            class="w-44"
            :aria-label="t('inbox.teamLabel')"
            :data-testid="TEST_ID.inboxFilterTeam"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("inbox.allTeams")
            }}</SelectItem>
            <SelectItem
              v-for="teamOption in teamOptions"
              :key="teamOption.value"
              :value="teamOption.value"
            >
              {{ teamOption.label }}
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

      <div
        v-if="overdueCount > 0"
        class="rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-2 text-sm text-status-warning"
        :data-testid="TEST_ID.inboxOverdue"
      >
        {{ t("inbox.overdue", overdueCount) }}
      </div>

      <div v-for="section in sections" :key="section.key" class="space-y-4">
        <h2
          class="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
        >
          <!-- The header names the team that owns the block. It is the same
               axis the team lens narrows by, but the two answer different
               questions: what is in front of me now vs. what does this block
               contain (ADR-084). -->
          <Users class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
