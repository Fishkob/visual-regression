<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import BulkFailureDialog from "@/components/bulk-actions/BulkFailureDialog.vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import EmptyState from "@/components/EmptyState.vue";
import ProjectGroupSection from "@/components/projects/ProjectGroupSection.vue";
import BulkMoveProjectsDialog from "@/components/projects/BulkMoveProjectsDialog.vue";
import NewProjectDialog from "@/components/projects/NewProjectDialog.vue";
import { useBulkMoveProjects } from "@/composables/useBulkActions";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { useCurrentRole } from "@/composables/useAuth";
import { useCreateProject } from "@/composables/useProjectCreate";
import { useProjectsWithPendingQuery } from "@/composables/useProjects";
import { useGroupsQuery } from "@/composables/useGroups";
import { FILTER_ALL } from "@/domains/test-status";
import { groupProjectsByGroup } from "@/domains/projects/group-projects-by-group";
import type { ProjectsListQuery } from "@/domains/projects/query-keys";
import { UNASSIGNED_GROUP_QUERY } from "@/domains/groups/group-section";
import {
  bulkFailureRows,
  type BulkFailureRow,
} from "@/domains/bulk-actions/bulk-action.model";
import { PROJECTS_PAGE_SIZE } from "@/lib/pagination";
import { TEST_ID } from "@/lib/test-ids";
import PaginationBar from "@/components/PaginationBar.vue";

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

// The input is local so typing stays responsive; the URL (and therefore the
// request) is updated after a short pause. Server-side search without a debounce
// would issue one request per keystroke.
const searchInput = ref(String(route.query.q ?? ""));
let searchTimer: ReturnType<typeof setTimeout> | undefined;

watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (String(route.query.q ?? "") === value) return;
    const query: Record<string, string | undefined> = {
      ...route.query,
      q: value || undefined,
    };
    delete query.page;
    void router.replace({ query });
  }, 300);
});

watch(
  () => route.query.q,
  (value) => {
    const next = String(value ?? "");
    if (next !== searchInput.value) searchInput.value = next;
  },
);

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});

const groupFilter = computed({
  get: () => {
    const value = route.query.group;
    return typeof value === "string" && value ? value : FILTER_ALL;
  },
  set: (value: string) => {
    const query: Record<string, string | undefined> = {
      ...route.query,
      group: value === FILTER_ALL ? undefined : value,
    };
    delete query.page;
    void router.replace({ query });
  },
});

// Filtering happens on the server: the view only holds the current page, so a
// client-side filter would silently filter 25 of N projects.
const queryParams = computed<ProjectsListQuery>(() => ({
  page: page.value,
  ...(searchInput.value.trim() ? { q: searchInput.value.trim() } : {}),
  ...(groupFilter.value !== FILTER_ALL ? { groupId: groupFilter.value } : {}),
}));

const { data, isLoading, error, refetch } =
  useProjectsWithPendingQuery(queryParams);
const projects = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / PROJECTS_PAGE_SIZE)),
);
const sections = computed(() => groupProjectsByGroup(projects.value));
const hasActiveFilters = computed(
  () => searchInput.value.trim().length > 0 || groupFilter.value !== FILTER_ALL,
);

// A filter change can shrink the result below the current page; keep the URL
// and the request on a page that exists.
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

const {
  data: groups,
  isLoading: groupsLoading,
  error: groupsError,
  refetch: refetchGroups,
} = useGroupsQuery();
const createProject = useCreateProject();
const dialogOpen = ref(false);

const createPending = computed(() => createProject.isPending.value);
const createError = computed(() => createProject.error.value);

// Bulk move is a writer tool: VIEWERs get no checkboxes or bulk bar (the
// backend answers 403 for them anyway).
const { canWrite } = useCurrentRole();
const bulkMove = useBulkMoveProjects();
const {
  selectedIds,
  count: selectedCount,
  toggle: toggleSelection,
  selectAll,
  clear: clearSelection,
  prune: pruneSelection,
} = useBulkSelection();

const pageProjectNames = computed(() =>
  projects.value.map((project) => project.name),
);
const allSelected = computed(
  () =>
    projects.value.length > 0 && selectedCount.value === projects.value.length,
);

// A refetch, a page change or a filter can remove rows; a stale name must not be
// moved by a later bulk action.
watch(pageProjectNames, (names) => pruneSelection(names));

function toggleAllSelection() {
  if (allSelected.value) clearSelection();
  else selectAll(pageProjectNames.value);
}

const moveOpen = ref(false);
const failureOpen = ref(false);
const failureRows = ref<BulkFailureRow[]>([]);

function confirmMove(payload: { groupId: string | null }) {
  const labels = new Map(selectedIds.value.map((name) => [name, name]));
  bulkMove.mutate(
    {
      // Sorted for a stable request payload regardless of the click order.
      projectNames: [...selectedIds.value].sort(),
      groupId: payload.groupId,
    },
    {
      onSuccess: (result) => {
        moveOpen.value = false;
        clearSelection();
        if (result.failed.length > 0) {
          failureRows.value = bulkFailureRows(result.failed, labels);
          failureOpen.value = true;
        }
      },
    },
  );
}

watch(
  [groups, groupsLoading],
  ([list, loading]) => {
    if (loading || !list) return;
    const value = groupFilter.value;
    if (value === FILTER_ALL || value === UNASSIGNED_GROUP_QUERY) return;
    if (!list.some((group) => group.id === value)) {
      groupFilter.value = FILTER_ALL;
    }
  },
  { immediate: true },
);

function openCreate() {
  createProject.reset();
  dialogOpen.value = true;
}

function create(payload: { name: string; groupId?: string }) {
  if (!payload.name) return;
  createProject.mutate(payload, {
    onSuccess: (_data, variables) => {
      dialogOpen.value = false;
      void router.push({
        name: "project-detail",
        params: { projectName: variables.name },
      });
    },
  });
}
</script>

<template>
  <Breadcrumbs class="px-6 py-3 text-sm text-muted-foreground" />

  <div class="space-y-6 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-xl font-semibold tracking-tight">Projects</h1>
      <div class="flex flex-wrap items-center gap-2">
        <Input
          :model-value="searchInput"
          placeholder="Search project..."
          aria-label="Search projects"
          class="w-64 rounded-xl shadow-sm"
          :data-testid="TEST_ID.projectSearch"
          @update:model-value="searchInput = String($event)"
        />
        <Select
          :model-value="groupFilter"
          :disabled="groupsLoading"
          @update:model-value="groupFilter = String($event)"
        >
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
              v-for="group in groups ?? []"
              :key="group.id"
              :value="group.id"
            >
              {{ group.name }}
            </SelectItem>
            <SelectItem :value="UNASSIGNED_GROUP_QUERY">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          :data-testid="TEST_ID.newProject"
          @click="openCreate"
        >
          New project
        </Button>
      </div>
    </div>

    <ErrorAlert
      v-if="error"
      variant="error"
      title="Failed to load projects"
      :message="error.message"
      retry
      :on-retry="refetch"
    />

    <div v-if="!error" class="space-y-6">
      <ErrorAlert
        v-if="groupsError"
        variant="error"
        title="Failed to load groups"
        :message="groupsError.message"
        retry
        :on-retry="refetchGroups"
      />

      <template v-if="isLoading">
        <section v-for="i in 3" :key="i" class="space-y-2" aria-hidden="true">
          <div class="flex items-center justify-between">
            <div class="h-4 w-24 animate-pulse rounded bg-muted" />
            <div class="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
          <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div
              v-for="row in 2"
              :key="row"
              class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
              :data-testid="TEST_ID.skeletonRow"
            >
              <div class="space-y-2">
                <div class="h-4 w-40 animate-pulse rounded bg-muted" />
                <div class="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
              <div class="h-5 w-12 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <div
          v-if="canWrite && projects.length > 0"
          class="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-2 shadow-sm"
          :data-testid="TEST_ID.projectBulkBar"
        >
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="h-4 w-4"
              :checked="allSelected"
              :aria-label="
                allSelected
                  ? 'Clear the selection'
                  : 'Select all projects on this page'
              "
              :data-testid="TEST_ID.projectSelectAll"
              @change="toggleAllSelection"
            />
            <span>Select all on this page</span>
          </label>
          <span class="text-sm text-muted-foreground">
            {{ selectedCount }} selected
          </span>
          <Button
            type="button"
            size="sm"
            :disabled="selectedCount === 0 || bulkMove.isPending.value"
            :data-testid="TEST_ID.projectBulkMove"
            @click="moveOpen = true"
          >
            Move to group
          </Button>
        </div>

        <ProjectGroupSection
          v-for="section in sections"
          :key="section.key"
          :section="section"
          :selectable="canWrite"
          :selected-names="selectedIds"
          @toggle="toggleSelection"
        />

        <PaginationBar
          v-if="pageCount > 1"
          :page="page"
          :page-count="pageCount"
          :total="total"
          item-label="projects"
          @update:page="page = $event"
        />

        <div v-if="projects.length === 0" class="space-y-4">
          <EmptyState
            :title="
              hasActiveFilters
                ? 'No projects match these filters'
                : 'No projects found'
            "
            :description="
              hasActiveFilters
                ? 'Try a different search or group.'
                : 'Create a project or upload a screenshot from CI to get started.'
            "
          />
          <div v-if="!hasActiveFilters" class="flex justify-center">
            <Button
              type="button"
              :data-testid="TEST_ID.newProjectEmpty"
              @click="openCreate"
            >
              New project
            </Button>
          </div>
        </div>
      </template>
    </div>

    <NewProjectDialog
      v-model:open="dialogOpen"
      :groups="groups ?? []"
      :pending="createPending"
      :error="createError"
      @submit="create"
    />

    <BulkMoveProjectsDialog
      :open="moveOpen"
      :groups="groups ?? []"
      :selected-count="selectedCount"
      :pending="bulkMove.isPending.value"
      @update:open="moveOpen = $event"
      @submit="confirmMove"
    />

    <BulkFailureDialog
      :open="failureOpen"
      :rows="failureRows"
      title="Some projects could not be moved"
      description="The batch continued past these projects. Fix the cause and move them individually."
      @update:open="failureOpen = $event"
    />
  </div>
</template>
