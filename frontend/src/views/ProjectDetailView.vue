<template>
  <Breadcrumbs
    class="px-6 py-3 text-sm text-muted-foreground"
    :group-name="project?.groupName ?? undefined"
  />

  <div class="space-y-6 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-xl font-semibold">
          {{ project?.name || projectName }}
        </h2>
        <template v-if="project">
          <Badge variant="secondary" :data-testid="TEST_ID.projectGroupBadge">
            {{ project.groupName || t("projects.unassigned") }}
          </Badge>
          <span
            class="text-sm text-muted-foreground"
            :data-testid="TEST_ID.projectPendingCount"
          >
            {{ t("projectDetail.pendingCount", pendingCount) }}
          </span>
          <span
            class="text-sm text-muted-foreground"
            :data-testid="TEST_ID.projectTestCount"
          >
            {{ t("projectDetail.testCount", testCount) }}
          </span>
        </template>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="visibleBranches.length > 0">
          <Select v-model="selectedBranchModel">
            <SelectTrigger
              class="w-56"
              :aria-label="t('projectDetail.branch')"
              :data-testid="TEST_ID.projectBranchSelect"
            >
              <SelectValue :placeholder="t('projectDetail.defaultBranch')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="branchOption in visibleBranches"
                :key="branchOption.name"
                :value="branchOption.name"
              >
                {{ branchOption.name
                }}{{
                  branchOption.isDefault
                    ? t("projectDetail.defaultSuffix")
                    : ""
                }}{{
                  branchOption.isArchived
                    ? t("projectDetail.archivedSuffix")
                    : ""
                }}
              </SelectItem>
            </SelectContent>
          </Select>
          <span
            v-if="inheritLabel"
            class="text-xs text-muted-foreground"
            :data-testid="TEST_ID.projectBranchTarget"
          >
            {{ t("projectDetail.inherits", { target: inheritLabel }) }}
          </span>
          <BranchActionsMenu
            v-if="selectedBranchInfo"
            :branch="selectedBranchInfo"
            :pending="branchMutationsPending"
            :targets="retargetCandidates"
            :dependent-names="dependentBranchNames"
            @archive="handleArchive"
            @delete="handleDelete"
            @set-default="handleSetDefault"
            @retarget="handleRetarget"
          />
        </template>
        <span
          v-else-if="branchesError"
          class="flex items-center gap-2 text-xs text-muted-foreground"
          :data-testid="TEST_ID.branchSwitcherError"
        >
          {{ t("projectDetail.branchesUnavailable") }}
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="refetchBranches()"
          >
            {{ t("projectDetail.retry") }}
          </Button>
        </span>
        <Button
          v-if="project"
          type="button"
          variant="outline"
          :data-testid="TEST_ID.moveProject"
          @click="openMove"
        >
          {{ t("projectDetail.moveToGroup") }}
        </Button>
        <Button
          v-if="project && canWrite"
          type="button"
          variant="outline"
          :data-testid="TEST_ID.reviewSettingsAction"
          @click="reviewSettingsOpen = true"
        >
          {{ t("reviewSettings.action") }}
        </Button>
        <Button
          v-if="project && canWrite"
          type="button"
          variant="outline"
          :data-testid="TEST_ID.shareAction"
          @click="shareOpen = true"
        >
          <Share2 class="h-4 w-4" />
          {{ t("share.action") }}
        </Button>
        <RouterLink
          v-if="project"
          :to="{ name: 'project-runs', params: { projectName } }"
          :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          :data-testid="TEST_ID.runsLink"
        >
          <ListChecks class="h-4 w-4" />
          {{ t("projectDetail.runs") }}
        </RouterLink>
        <RouterLink
          v-if="project"
          :to="{ name: 'project-trends', params: { projectName } }"
          :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          :data-testid="TEST_ID.trendsLink"
        >
          <TrendingUp class="h-4 w-4" />
          {{ t("projectDetail.trends") }}
        </RouterLink>
        <RouterLink
          v-if="project && isAdmin"
          :to="{ name: 'project-webhooks', params: { projectName } }"
          :class="buttonVariants({ variant: 'outline', size: 'sm' })"
          :data-testid="TEST_ID.webhooksLink"
        >
          <Webhook class="h-4 w-4" />
          {{ t("projectDetail.webhooks") }}
        </RouterLink>
      </div>
    </div>

    <ProjectStoragePanel :project-name="projectName" />

    <AsyncState
      :is-loading="activeTabState.isLoading"
      :error="activeTabState.error"
      :error-title="t('projectDetail.errorTitle')"
      :retry="activeTabState.refetch"
      :empty="tests.length === 0"
      :empty-title="emptyTitle"
      :empty-description="emptyDescription"
    >
      <template #loading>
        <SkeletonAccordionGroups />
      </template>
      <VisualTestsTable
        :tests="tests"
        :project-name="projectName ?? ''"
        :branch-name="selectedBranch"
        :server-filtered="true"
        :filter-options="filterOptions"
        sync-url
      />
      <PaginationBar
        v-if="pageCount > 1"
        :page="page"
        :page-count="pageCount"
        :total="meta?.total ?? 0"
        :item-label="t('projectDetail.variants')"
        @update:page="page = $event"
      />
    </AsyncState>
  </div>

  <ReviewSettingsDialog
    v-if="reviewSettingsOpen && project"
    :open="reviewSettingsOpen"
    :project-name="projectName"
    :required-approvals="project.requiredApprovals ?? 1"
    @update:open="reviewSettingsOpen = $event"
  />

  <ShareLinksDialog
    v-if="shareOpen"
    :open="shareOpen"
    :project-name="projectName"
    @update:open="shareOpen = $event"
  />

  <MoveProjectDialog
    :open="moveOpen"
    :groups="groups ?? []"
    :current-group-id="project?.groupId"
    :pending="movePending"
    :error="moveError"
    @update:open="handleMoveOpen"
    @submit="move"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ListChecks, Share2, TrendingUp, Webhook } from "@lucide/vue";

import Breadcrumbs from "@/components/Breadcrumbs.vue";
import AsyncState from "@/components/AsyncState.vue";
import SkeletonAccordionGroups from "@/components/cards/SkeletonAccordionGroups.vue";
import ProjectStoragePanel from "@/components/storage/ProjectStoragePanel.vue";
import ShareLinksDialog from "@/components/share/ShareLinksDialog.vue";
import ReviewSettingsDialog from "@/components/projects/ReviewSettingsDialog.vue";
import MoveProjectDialog from "@/components/projects/MoveProjectDialog.vue";
import VisualTestsTable from "@/components/tables/VisualTestsTable.vue";
import PaginationBar from "@/components/PaginationBar.vue";
import BranchActionsMenu from "@/components/branches/BranchActionsMenu.vue";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBranchesQuery } from "@/composables/useBranches";
import type { ProjectBranch } from "@/domains/branches/branch.model";
import { useBranchMutations } from "@/composables/useBranchMutations";
import { useCurrentRole } from "@/composables/useAuth";
import { useGroupsQuery } from "@/composables/useGroups";
import {
  useProjectDetailPage,
  type ProjectDetailFilters,
} from "@/composables/useProjectDetailPage";
import { useProjectGroupAssignment } from "@/composables/useProjectGroupAssignment";
import { useRouteParams } from "@/composables/useRouteParams";
import { PROJECT_DETAIL_PAGE_SIZE } from "@/lib/pagination";
import { TEST_ID } from "@/lib/test-ids";

const { projectName } = useRouteParams();
const { t } = useI18n();
// Webhooks are admin-only (route meta enforces it too); Runs and Trends stay
// available to every role.
const { isAdmin, canWrite } = useCurrentRole();
const route = useRoute();
const router = useRouter();

// Archived branches are fetched too: they stay readable, and hiding them from
// the switcher made "unarchive" unreachable — once a branch was archived and the
// page left, there was no way back to it.
const {
  data: branches,
  error: branchesError,
  refetch: refetchBranches,
} = useBranchesQuery(projectName, true);

const routeBranch = computed(() =>
  typeof route.query.branch === "string" ? route.query.branch : undefined,
);

// The query keys on the *requested* branch rather than the resolved selection:
// the resolved name comes from the project read itself, so keying on it would
// refetch the project a second time (and flash the loading state) on first
// paint. Selecting a branch writes it to the route, which is what re-keys it.
// Server-side search needs a debounce; the other filters apply immediately.
const routeString = (key: string): string | undefined => {
  const value = route.query[key];
  return typeof value === "string" && value ? value : undefined;
};

const rawSearch = computed(() => routeString("q"));
const searchQuery = ref(rawSearch.value ?? "");
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(rawSearch, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery.value = value ?? "";
  }, 300);
});
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

// The table owns the filter inputs and writes them to the URL; the page reads
// the same URL and turns it into the server query, so the table never filters
// the one page it was handed.
const filters = computed<ProjectDetailFilters>(() => {
  const kind = routeString("kind");
  const status = routeString("status");
  const viewport = routeString("viewport");
  const browser = routeString("browser");
  const environment = routeString("environment");
  return {
    ...(searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {}),
    ...(kind === "image" || kind === "pdf" ? { kind } : {}),
    ...(status === "pending" || status === "ok" ? { status } : {}),
    ...(viewport ? { viewport } : {}),
    ...(browser ? { browser } : {}),
    ...(environment ? { environment } : {}),
  };
});

// "No tests found" is wrong when a search/filter matched nothing: the project
// is not empty, the current filter is just too narrow. The empty state says
// which one it is so a reviewer does not conclude the branch has no tests.
const hasActiveFilters = computed(() => Object.keys(filters.value).length > 0);
const emptyTitle = computed(() =>
  hasActiveFilters.value
    ? t("projectDetail.emptyFilteredTitle")
    : t("projectDetail.emptyTitle"),
);
const emptyDescription = computed(() =>
  hasActiveFilters.value
    ? t("projectDetail.emptyFilteredBody")
    : t("projectDetail.emptyBody"),
);

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

const {
  project,
  tests,
  pendingCount,
  testCount,
  meta,
  filterOptions,
  activeTabState,
} = useProjectDetailPage(projectName, routeBranch, filters, page);

const pageCount = computed(() =>
  Math.max(1, Math.ceil((meta.value?.total ?? 0) / PROJECT_DETAIL_PAGE_SIZE)),
);
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

// The selected branch is the explicitly requested one, else the branch the
// project read resolved, else the project default. The backend resolves an
// absent branch to the default, so the switcher stays consistent with the data.
const selectedBranch = computed(
  () =>
    routeBranch.value ??
    project.value?.branchName ??
    project.value?.defaultBranchName,
);

const selectedBranchModel = computed({
  get: () => selectedBranch.value ?? "",
  set: (name: string) => {
    if (name) selectBranch(name);
  },
});

// Archived branches are listed, not hidden: they are readable (and unarchivable)
// by design, and hiding them was a one-way door out of the branch.
const visibleBranches = computed(() => branches.value ?? []);

const selectedBranchInfo = computed(() =>
  (branches.value ?? []).find((branch) => branch.name === selectedBranch.value),
);

// The effective target is part of a branch's identity (it decides which baseline
// an unapproved variant compares against), so it is rendered instead of only
// being fetched.
const inheritLabel = computed(() => {
  const info = selectedBranchInfo.value;
  if (!info || info.isDefault || !info.targetBranchName) return "";
  return info.targetBranchName;
});

// A branch that (transitively) inherits from the branch being retargeted would
// close a cycle, which the API rejects with a 409. The whole graph is already in
// memory, so the dialog only offers targets that can actually be set.
function wouldCreateCycle(
  candidate: ProjectBranch,
  branchName: string,
  byName: Map<string, ProjectBranch>,
): boolean {
  let cursor: ProjectBranch | undefined = candidate;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor.name === branchName) return true;
    if (seen.has(cursor.name)) return false;
    seen.add(cursor.name);
    cursor = cursor.targetBranchName
      ? byName.get(cursor.targetBranchName)
      : undefined;
  }
  return false;
}

// Retarget candidates: every other branch that is still usable as a target.
const retargetCandidates = computed(() => {
  const selected = selectedBranchInfo.value;
  if (!selected) return [];
  const byName = new Map(
    (branches.value ?? []).map((branch) => [branch.name, branch]),
  );
  return (branches.value ?? [])
    .filter(
      (branch) =>
        branch.name !== selected.name &&
        !branch.isArchived &&
        !wouldCreateCycle(branch, selected.name, byName),
    )
    .map((branch) => branch.name);
});

// Branches that explicitly inherit from the selected one. Deleting it would
// silently re-parent them to the project default, so the UI blocks it up front
// (the API rejects it too).
const dependentBranchNames = computed(() => {
  const info = selectedBranchInfo.value;
  if (!info) return [];
  return (branches.value ?? [])
    .filter(
      (branch) =>
        branch.name !== info.name &&
        !branch.isDefault &&
        branch.targetBranchName === info.name,
    )
    .map((branch) => branch.name);
});

const branchMutations = useBranchMutations(projectName);
const branchMutationsPending = computed(
  () =>
    branchMutations.archive.isPending.value ||
    branchMutations.remove.isPending.value ||
    branchMutations.setDefault.isPending.value ||
    branchMutations.setTarget.isPending.value,
);

// A branch that disappeared elsewhere (deleted in another tab, stale bookmark)
// must not leave the page on a dead error state: once the branch list is known,
// drop a `?branch=` that no longer resolves and fall back to the default.
watch([branches, routeBranch], ([list, requested]) => {
  if (!requested || !list || list.length === 0) return;
  if (list.some((branch) => branch.name === requested)) return;
  const query = { ...route.query };
  delete query.branch;
  void router.replace({ query });
});

function selectBranch(name: string) {
  const query = { ...route.query };
  // The default branch needs no parameter — keeping it out means one cache
  // entry per branch instead of two for the same server state.
  if (
    (branches.value ?? []).find((branch) => branch.name === name)?.isDefault
  ) {
    delete query.branch;
  } else {
    query.branch = name;
  }
  void router.replace({ query });
}

function handleSetDefault() {
  const branch = selectedBranchInfo.value;
  if (!branch) return;
  branchMutations.setDefault.mutate(branch.name);
}

function handleRetarget(targetBranch: string | null) {
  const branch = selectedBranchInfo.value;
  if (!branch) return;
  branchMutations.setTarget.mutate({ branch: branch.name, targetBranch });
}

function handleArchive(isArchived: boolean) {
  const branch = selectedBranchInfo.value;
  if (!branch) return;
  branchMutations.archive.mutate({ branch: branch.name, isArchived });
}

function handleDelete() {
  const branch = selectedBranchInfo.value;
  if (!branch) return;
  branchMutations.remove.mutate(branch.name, {
    onSuccess: () => {
      // Deleting the branch being viewed must not leave the page pointed at a
      // branch that no longer exists — fall back to the project default.
      if (routeBranch.value !== branch.name) return;
      // The default branch needs no parameter (same convention as
      // selectBranch), so deleting the viewed branch always lands on the
      // parameter-less default read instead of a duplicate cache entry.
      const query = { ...route.query };
      delete query.branch;
      void router.replace({ query });
    },
  });
}

const { data: groups } = useGroupsQuery();
const moveMutation = useProjectGroupAssignment();
const reviewSettingsOpen = ref(false);
const shareOpen = ref(false);
const moveOpen = ref(false);
const movePending = computed(() => moveMutation.isPending.value);
const moveError = computed(() => moveMutation.error.value);

function openMove() {
  moveMutation.reset();
  moveOpen.value = true;
}

function handleMoveOpen(open: boolean) {
  if (!open) moveMutation.reset();
  moveOpen.value = open;
}

function move(groupId: string | null) {
  moveMutation.mutate(
    { projectName: projectName.value, groupId },
    {
      onSuccess: () => {
        moveOpen.value = false;
      },
    },
  );
}
</script>
