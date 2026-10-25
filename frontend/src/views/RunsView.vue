<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AsyncState from "@/components/AsyncState.vue";
import PaginationBar from "@/components/PaginationBar.vue";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBranchesQuery } from "@/composables/useBranches";
import { useRouteParams } from "@/composables/useRouteParams";
import { useRuns } from "@/composables/useRuns";
import {
  runFinishedLabel,
  shortCommitSha,
  type Run,
} from "@/domains/runs/run.model";
import { FILTER_ALL } from "@/domains/test-status";
import { formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const { projectName } = useRouteParams();

// The branch filter and the page are view-local: unlike the review inbox they
// are not a review scope another page hands back, so they do not belong in the
// URL. "All branches" (the sentinel) is the server's cross-branch read.
const branchFilter = ref<string>(FILTER_ALL);
const page = ref(1);

const branchModel = computed({
  get: () => branchFilter.value,
  set: (value: string) => {
    branchFilter.value = value;
    // The previous page may not exist for the narrower set.
    page.value = 1;
  },
});

// Archived branches stay selectable: a run on an archived branch remains
// readable, so hiding it from the filter would strand that history.
const { data: branches } = useBranchesQuery(projectName, true);
const branchOptions = computed(() => branches.value ?? []);

const { data, isLoading, error, refetch } = useRuns(
  projectName,
  computed(() =>
    branchFilter.value === FILTER_ALL ? undefined : branchFilter.value,
  ),
  page,
);

const runs = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const pageCount = computed(() => Math.max(1, data.value?.totalPages ?? 0));
// The pager follows the page the server reports, not just the requested one.
const currentPage = computed(() => data.value?.page ?? page.value);
const filtered = computed(() => branchFilter.value !== FILTER_ALL);

function absoluteTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

// A run key is unique per branch, so the detail link carries the branch it was
// listed under — without it the detail read resolves against the default branch.
function runLink(run: Run) {
  return {
    name: "run-detail",
    params: { projectName: projectName.value, runKey: run.key },
    query: { branch: run.branchName },
  };
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.runsView">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-sm text-muted-foreground">{{ projectName }}</p>
        <h1 class="text-xl font-semibold tracking-tight">Runs</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          CI uploads grouped by run key — commit, derived status and the pending
          review a gate will wait for.
        </p>
      </div>
      <Select v-model="branchModel">
        <SelectTrigger class="w-56" aria-label="Filter runs by branch">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="FILTER_ALL">All branches</SelectItem>
          <SelectItem
            v-for="branch in branchOptions"
            :key="branch.name"
            :value="branch.name"
          >
            {{ branch.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load runs"
      :retry="refetch"
      :empty="runs.length === 0"
    >
      <template #loading>
        <div
          class="overflow-hidden rounded-xl border bg-card shadow-sm"
          aria-hidden="true"
        >
          <div
            v-for="row in 5"
            :key="row"
            class="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
            :data-testid="TEST_ID.skeletonRow"
          >
            <div class="h-4 w-24 animate-pulse rounded bg-muted" />
            <div class="h-4 w-20 animate-pulse rounded bg-muted" />
            <div class="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div class="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </template>

      <template #empty>
        <div
          class="rounded-xl border bg-card p-8 text-center shadow-sm"
          :data-testid="TEST_ID.runsEmpty"
        >
          <p class="text-sm text-muted-foreground">
            {{
              filtered
                ? "No runs on this branch yet."
                : "No runs yet — pass a runKey on upload to group a CI run."
            }}
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Commit</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead>Finished</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="run in runs"
                :key="run.id"
                :data-testid="TEST_ID.runRow"
              >
                <TableCell class="whitespace-nowrap">
                  <RouterLink
                    :to="runLink(run)"
                    class="font-mono font-medium underline-offset-4 hover:underline"
                  >
                    {{ run.key }}
                  </RouterLink>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" class="font-mono text-[10px]">
                    {{ run.branchName }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div
                    :data-testid="TEST_ID.runCommit"
                    :title="run.commitSha ?? undefined"
                  >
                    <p
                      v-if="run.commitSha"
                      class="font-mono text-xs"
                      :title="run.commitSha"
                    >
                      {{ shortCommitSha(run.commitSha) }}
                    </p>
                    <p
                      v-if="run.commitMessage"
                      class="max-w-64 truncate text-xs text-muted-foreground"
                      :title="run.commitMessage"
                    >
                      {{ run.commitMessage }}
                    </p>
                    <span
                      v-if="!run.commitSha && !run.commitMessage"
                      class="text-sm text-muted-foreground"
                    >
                      —
                    </span>
                  </div>
                </TableCell>
                <TableCell class="whitespace-nowrap text-sm">
                  <span :title="absoluteTime(run.createdAt)">
                    {{ formatRelativeAge(run.createdAt) }}
                  </span>
                </TableCell>
                <TableCell class="whitespace-nowrap text-sm">
                  <span :title="absoluteTime(run.lastActivityAt)">
                    {{ formatRelativeAge(run.lastActivityAt) }}
                  </span>
                </TableCell>
                <TableCell class="whitespace-nowrap text-sm">
                  <span v-if="run.finishedAt">
                    <span :title="absoluteTime(run.finishedAt)">
                      {{ formatRelativeAge(run.finishedAt) }}
                    </span>
                    <span class="text-muted-foreground">
                      · {{ runFinishedLabel(run) }}
                    </span>
                  </span>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <PaginationBar
          v-if="pageCount > 1"
          :page="currentPage"
          :page-count="pageCount"
          :total="total"
          item-label="runs"
          @update:page="page = $event"
        />
      </div>
    </AsyncState>
  </div>
</template>
