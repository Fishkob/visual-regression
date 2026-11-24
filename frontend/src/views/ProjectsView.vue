<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert.vue";
import EmptyState from "@/components/EmptyState.vue";
import ProjectListSection from "@/components/projects/ProjectListSection.vue";
import NewProjectDialog from "@/components/projects/NewProjectDialog.vue";
import { useCurrentRole } from "@/composables/useAuth";
import { useCreateProject } from "@/composables/useProjectCreate";
import { useProjectsWithPendingQuery } from "@/composables/useProjects";
import { useMeQuery } from "@/composables/useAuth";
import { useTeamsQuery } from "@/composables/useTeams";
import type { TeamChoice } from "@/domains/teams/team.model";
import { groupProjectsByTeam } from "@/domains/projects/group-projects-by-team";
import type { ProjectsListQuery } from "@/domains/projects/query-keys";
import { PROJECTS_PAGE_SIZE } from "@/lib/pagination";
import { TEST_ID } from "@/lib/test-ids";
import PaginationBar from "@/components/PaginationBar.vue";

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

// Filtering happens on the server: the view only holds the current page, so a
// client-side filter would silently filter 25 of N projects.
const queryParams = computed<ProjectsListQuery>(() => ({
  page: page.value,
  ...(searchInput.value.trim() ? { q: searchInput.value.trim() } : {}),
}));

const { data, isLoading, error, refetch } =
  useProjectsWithPendingQuery(queryParams);
const projects = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const pageCount = computed(() =>
  Math.max(1, Math.ceil(total.value / PROJECTS_PAGE_SIZE)),
);
const sections = computed(() => groupProjectsByTeam(projects.value));
const hasActiveFilters = computed(() => searchInput.value.trim().length > 0);

// A filter change can shrink the result below the current page; keep the URL
// and the request on a page that exists.
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

const createProject = useCreateProject();
const dialogOpen = ref(false);

const createPending = computed(() => createProject.isPending.value);
const createError = computed(() => createProject.error.value);

const { seesAllProjects, isAdmin } = useCurrentRole();

// A project always has an owner (ADR-083), so "new project" asks for it. An ADMIN
// may name any team (the team list is an ADMIN read); a MEMBER may only name one
// of its own, which `/auth/me` already carries. The first option is preselected,
// matching the order the API falls back to.
const { data: me } = useMeQuery();
const { data: allTeams } = useTeamsQuery(isAdmin);
const teamChoices = computed<TeamChoice[]>(() =>
  isAdmin.value
    ? (allTeams.value ?? []).map((team) => ({ id: team.id, name: team.name }))
    : (me.value?.teams ?? []),
);
// The bulk bar moved with the group it wrote to: multi-select existed to file
// projects into a folder, and the owner is edited where ownership lives — the
// Teams page and the project's own settings (ADR-084).
function openCreate() {
  createProject.reset();
  dialogOpen.value = true;
}

function create(payload: { name: string; teamId: string }) {
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
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t("projects.title") }}
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ t("projects.subtitle") }}
        </p>
      </div>
      <Button
        type="button"
        :data-testid="TEST_ID.newProject"
        @click="openCreate"
      >
        {{ t("projects.newProject") }}
      </Button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Input
        :model-value="searchInput"
        :placeholder="t('projects.searchPlaceholder')"
        :aria-label="t('projects.searchLabel')"
        class="w-64 rounded-xl shadow-sm"
        :data-testid="TEST_ID.projectSearch"
        @update:model-value="searchInput = String($event)"
      />
    </div>

    <ErrorAlert
      v-if="error"
      variant="error"
      :title="t('projects.errorTitle')"
      :message="error.message"
      retry
      :on-retry="refetch"
    />

    <div v-if="!error" class="space-y-6">
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
        <ProjectListSection
          v-for="section in sections"
          :key="section.key"
          :section="section"
        />

        <PaginationBar
          v-if="pageCount > 1"
          :page="page"
          :page-count="pageCount"
          :total="total"
          :item-label="t('pagination.projects')"
          @update:page="page = $event"
        />

        <div v-if="projects.length === 0" class="space-y-4">
          <EmptyState
            :title="
              hasActiveFilters
                ? t('projects.emptyFilteredTitle')
                : !seesAllProjects
                  ? t('projects.emptyScopedTitle')
                  : t('projects.emptyTitle')
            "
            :description="
              hasActiveFilters
                ? t('projects.emptyFilteredBody')
                : !seesAllProjects
                  ? t('projects.emptyScopedBody')
                  : t('projects.emptyBody')
            "
          />
          <div v-if="!hasActiveFilters" class="flex justify-center">
            <Button
              type="button"
              :data-testid="TEST_ID.newProjectEmpty"
              @click="openCreate"
            >
              {{ t("projects.newProject") }}
            </Button>
          </div>
        </div>
      </template>
    </div>

    <NewProjectDialog
      v-model:open="dialogOpen"
      :teams="teamChoices"
      :pending="createPending"
      :error="createError"
      @submit="create"
    />
  </div>
</template>
