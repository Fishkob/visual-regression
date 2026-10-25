<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { ArrowLeft, Download, ExternalLink } from "@lucide/vue";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import ErrorAlert from "@/components/ErrorAlert.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouteParams } from "@/composables/useRouteParams";
import {
  RUN_REPORT_FORMATS,
  useRunDetail,
  useRunMutations,
  useRunReports,
  type RunReportFormat,
} from "@/composables/useRuns";
import { mapRunApproveAllResult } from "@/domains/runs/run.mapper";
import {
  RUN_STATE_BADGE_VARIANT,
  RUN_STATE_LABEL,
  runFinishedLabel,
  shortCommitSha,
  type RunPending,
} from "@/domains/runs/run.model";
import { formatRelativeAge } from "@/lib/format-date";
import { formatVariantLabel } from "@/lib/format-variant-label";
import { TEST_ID } from "@/lib/test-ids";

const { projectName, runKey, branch } = useRouteParams();

const {
  data: detail,
  isLoading,
  error,
  refetch,
} = useRunDetail(projectName, runKey, branch);
const { finish, approveAll } = useRunMutations(projectName, runKey, branch);
const { download: downloadReport, downloading } = useRunReports(
  projectName,
  runKey,
  branch,
);

// The three report buttons are one loop; the labels and ids stay in one map so a
// new format is a data change, not a template copy.
const REPORT_LABEL: Record<RunReportFormat, string> = {
  junit: "JUnit",
  html: "HTML",
  csv: "CSV",
};
const REPORT_TEST_ID: Record<RunReportFormat, string> = {
  junit: TEST_ID.runReportJunit,
  html: TEST_ID.runReportHtml,
  csv: TEST_ID.runReportCsv,
};

const finished = computed(() => Boolean(detail.value?.run.finishedAt));
const finishedAge = computed(() => {
  const finishedAt = detail.value?.run.finishedAt;
  return finishedAt ? formatRelativeAge(finishedAt) : "—";
});
const approveFailures = computed(
  () => mapRunApproveAllResult(approveAll.data.value).failed,
);
const approveFailureMessage = computed(() =>
  approveFailures.value
    .map((failure) => `${failure.comparisonId}: ${failure.error}`)
    .join("; "),
);

const finishOpen = ref(false);
const approveAllOpen = ref(false);

function requestFinish() {
  finish.reset();
  finishOpen.value = true;
}

function confirmFinish() {
  finish.mutate();
}

function requestApproveAll() {
  approveAll.reset();
  approveAllOpen.value = true;
}

function confirmApproveAll() {
  approveAll.mutate();
}

function absoluteTime(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

// The reviewable-details page is branch-scoped, and a run's pending row names
// the branch it was uploaded on, so the link must carry it — the default branch
// needs no parameter, matching the project switcher's convention.
function testLink(item: RunPending) {
  return {
    name: "test-detail",
    params: { projectName: projectName.value, testName: item.testName },
    ...(item.branchName ? { query: { branch: item.branchName } } : {}),
  };
}

function mismatchLabel(item: RunPending): string {
  return item.kind === "pdf"
    ? `${item.mismatchPageCount ?? 0} pages`
    : `${item.mismatchPixelCount} px`;
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.runDetail">
    <div>
      <RouterLink
        :to="{ name: 'project-runs', params: { projectName } }"
        class="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft class="h-4 w-4" />
        All runs
      </RouterLink>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load the run"
      :retry="refetch"
      :empty="!detail"
    >
      <template #loading>
        <div class="space-y-4" aria-hidden="true">
          <div class="h-8 w-64 animate-pulse rounded bg-muted" />
          <div class="h-24 animate-pulse rounded-xl bg-muted" />
          <div class="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </template>

      <template #empty>
        <div class="rounded-xl border bg-card p-8 text-center shadow-sm">
          <p class="text-sm text-muted-foreground">
            No run data — it may have been removed with its branch.
          </p>
        </div>
      </template>

      <div v-if="detail" class="space-y-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="text-xl font-semibold tracking-tight">
                {{ detail.run.key }}
              </h1>
              <Badge variant="secondary" class="font-mono text-[10px]">
                {{ detail.run.branchName }}
              </Badge>
              <Badge
                :variant="RUN_STATE_BADGE_VARIANT[detail.status.state]"
                :data-testid="TEST_ID.runStateBadge"
              >
                {{ RUN_STATE_LABEL[detail.status.state] }}
              </Badge>
            </div>

            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
            >
              <span
                v-if="detail.run.commitSha"
                class="font-mono"
                :title="detail.run.commitSha"
              >
                {{ shortCommitSha(detail.run.commitSha) }}
              </span>
              <span
                v-if="detail.run.commitMessage"
                class="max-w-md truncate"
                :title="detail.run.commitMessage"
              >
                {{ detail.run.commitMessage }}
              </span>
              <a
                v-if="detail.run.ciUrl"
                :href="detail.run.ciUrl"
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                CI run
                <ExternalLink class="h-3 w-3" />
              </a>
              <span :title="absoluteTime(detail.run.createdAt)">
                Created {{ formatRelativeAge(detail.run.createdAt) }}
              </span>
              <span :title="absoluteTime(detail.run.finishedAt)">
                Finished {{ finishedAge }}
              </span>
              <span v-if="detail.run.finishedAt">
                by {{ runFinishedLabel(detail.run) }}
              </span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span
              class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              Reports
            </span>
            <Button
              v-for="report in RUN_REPORT_FORMATS"
              :key="report"
              type="button"
              variant="outline"
              size="sm"
              :disabled="downloading !== null"
              :aria-busy="downloading === report"
              :aria-label="`Download the ${REPORT_LABEL[report]} report of ${detail.run.key}`"
              :data-testid="REPORT_TEST_ID[report]"
              @click="downloadReport(report)"
            >
              <Download class="h-4 w-4" />
              {{ REPORT_LABEL[report] }}
            </Button>
          </div>
        </div>

        <div class="space-y-3">
          <div
            class="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm"
          >
            <div>
              <p class="font-medium">Run status</p>
              <p class="text-sm text-muted-foreground">
                {{
                  finished
                    ? "This run is finished; its pending work can still be approved."
                    : "While the run is open its status is refreshed every few seconds."
                }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                :disabled="detail.status.pendingComparisons === 0"
                :data-testid="TEST_ID.runApproveAll"
                @click="requestApproveAll"
              >
                Approve all pending
              </Button>
              <Button
                type="button"
                :disabled="finished"
                :data-testid="TEST_ID.runFinish"
                @click="requestFinish"
              >
                Finish run
              </Button>
            </div>
          </div>

          <ErrorAlert
            v-if="approveFailures.length > 0"
            variant="warning"
            title="Some comparisons could not be approved"
            :message="approveFailureMessage"
          />

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">Pending comparisons</p>
              <p
                class="text-lg font-semibold"
                :data-testid="TEST_ID.runPendingCount"
              >
                {{ detail.status.pendingComparisons }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">Pending jobs</p>
              <p class="text-lg font-semibold">
                {{ detail.status.pendingJobs }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">Failed jobs</p>
              <p class="text-lg font-semibold">
                {{ detail.status.failedJobs }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">Approved</p>
              <p class="text-lg font-semibold">{{ detail.status.approved }}</p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">Tests</p>
              <p class="text-lg font-semibold">{{ detail.status.testCount }}</p>
            </div>
          </div>
        </div>

        <section class="space-y-2">
          <h2 class="text-sm font-semibold text-muted-foreground">
            Pending comparisons ({{ detail.pending.length }})
          </h2>
          <div
            v-if="detail.pending.length === 0"
            class="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm"
          >
            No pending comparisons in this run.
          </div>
          <div
            v-else
            class="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Mismatch</TableHead>
                  <TableHead>Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="item in detail.pending"
                  :key="item.comparisonId"
                  :data-testid="TEST_ID.runPendingRow"
                >
                  <TableCell class="whitespace-nowrap">
                    <RouterLink
                      :to="testLink(item)"
                      class="font-medium underline-offset-4 hover:underline"
                    >
                      {{ item.testName }}
                    </RouterLink>
                  </TableCell>
                  <TableCell class="text-sm">
                    {{ formatVariantLabel(item) || "No variant" }}
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">
                      {{ mismatchLabel(item) }}
                    </Badge>
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-sm">
                    <span :title="absoluteTime(item.createdAt)">
                      {{ formatRelativeAge(item.createdAt) }}
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        <section v-if="detail.failedJobs.length > 0" class="space-y-2">
          <h2 class="text-sm font-semibold text-muted-foreground">
            Failed jobs ({{ detail.failedJobs.length }})
          </h2>
          <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="job in detail.failedJobs"
                  :key="job.id"
                  :data-testid="TEST_ID.runFailedJobRow"
                >
                  <TableCell class="whitespace-nowrap font-medium">
                    {{ job.testName }}
                  </TableCell>
                  <TableCell>{{ job.branchName }}</TableCell>
                  <TableCell class="text-sm text-muted-foreground">
                    {{ job.error }}
                  </TableCell>
                  <TableCell class="whitespace-nowrap text-sm">
                    <span :title="absoluteTime(job.createdAt)">
                      {{ formatRelativeAge(job.createdAt) }}
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-semibold text-muted-foreground">
            Approvals ({{ detail.approvals.length }})
          </h2>
          <div
            v-if="detail.approvals.length === 0"
            class="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm"
          >
            No approvals in this run yet.
          </div>
          <ul
            v-else
            class="divide-y overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <li
              v-for="approval in detail.approvals"
              :key="approval.comparisonId"
              class="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              :data-testid="TEST_ID.runApprovalRow"
            >
              <span class="font-medium">{{ approval.testName }}</span>
              <span class="text-sm text-muted-foreground">
                approved by {{ approval.approvedBy }}
              </span>
              <span
                class="text-xs text-muted-foreground"
                :title="absoluteTime(approval.approvedAt)"
              >
                {{ formatRelativeAge(approval.approvedAt) }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </AsyncState>

    <ConfirmDialog
      :open="finishOpen"
      :pending="finish.isPending.value"
      title="Finish run"
      :description="`Finishing ${runKey} marks it complete. Uploads with the same run key reopen it.`"
      confirm-text="Finish run"
      cancel-text="Cancel"
      @confirm="confirmFinish"
      @cancel="finishOpen = false"
      @update:open="finishOpen = $event"
    />

    <ConfirmDialog
      :open="approveAllOpen"
      :pending="approveAll.isPending.value"
      title="Approve all pending"
      :description="`Approves every pending comparison in ${runKey}. A comparison that changed meanwhile fails alone; the rest are still approved.`"
      confirm-text="Approve all"
      cancel-text="Cancel"
      @confirm="confirmApproveAll"
      @cancel="approveAllOpen = false"
      @update:open="approveAllOpen = $event"
    />
  </div>
</template>
