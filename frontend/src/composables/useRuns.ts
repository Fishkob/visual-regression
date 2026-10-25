import { computed, unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { keepPreviousData } from "@tanstack/vue-query";
import {
  runsControllerApproveAll,
  runsControllerDetail,
  runsControllerFinish,
  runsControllerList,
  type PaginatedRunDto,
  type RunApproveAllResultDto,
  type RunDetailDto,
  type RunStatusResultDto,
} from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { mapRunDetail, mapRunPage } from "@/domains/runs/run.mapper";
import {
  isRunLive,
  type RunDetail,
  type RunListQuery,
} from "@/domains/runs/run.model";
import { runsQueryKeys } from "@/domains/runs/query-keys";
import {
  invalidateAfterRunApproveAll,
  invalidateRun,
} from "@/lib/invalidation";
import { RUNS_PAGE_SIZE } from "@/lib/pagination";

// A run page is a live view while the run is open: uploads land and comparisons
// finish while a reviewer watches it. Five seconds keeps the queue honest
// without hammering the derived status query, and passed/failed stop the poll.
export const RUN_DETAIL_POLL_INTERVAL_MS = 5_000;

// One server page of runs. The branch is optional: absent means the project's
// cross-branch read (the server treats an omitted branch as "all branches").
export function useRuns(
  projectName: MaybeRef<string>,
  branch: MaybeRef<string | undefined>,
  page: MaybeRef<number>,
  limit: number = RUNS_PAGE_SIZE,
) {
  const query = computed<RunListQuery>(() => {
    const branchName = unref(branch);
    return {
      page: Math.max(1, unref(page) || 1),
      limit,
      ...(branchName ? { branch: branchName } : {}),
    };
  });

  return useSdkQuery({
    args: { projectName, query },
    required: ["projectName"],
    placeholderData: keepPreviousData,
    keyOf: ({ projectName, query }) => runsQueryKeys.list(projectName, query),
    sdkFn: ({ projectName, query }) =>
      runsControllerList({ path: { projectName }, query }),
    map: (data: PaginatedRunDto | undefined) => mapRunPage(data),
  });
}

// The detail read already carries the derived status, so the status card and the
// pending/approval lists come from one query. Polling is state-driven: the
// interval function sees the latest payload and returns false once the run is
// terminal, which stops the timer instead of asking the server forever.
export function useRunDetail(
  projectName: MaybeRef<string>,
  runKey: MaybeRef<string>,
  branch: MaybeRef<string | undefined>,
) {
  return useSdkQuery({
    args: { projectName, runKey, branch },
    required: ["projectName", "runKey"],
    keyOf: ({ projectName, runKey, branch }) =>
      runsQueryKeys.detail(projectName, runKey, branch),
    sdkFn: ({ projectName, runKey, branch }) =>
      runsControllerDetail({
        path: { projectName, runKey },
        ...(branch ? { query: { branch } } : {}),
      }),
    map: (data: RunDetailDto | undefined) => mapRunDetail(data),
    refetchInterval: (query) => {
      const state = (query.state.data as RunDetail | undefined)?.status.state;
      return isRunLive(state) ? RUN_DETAIL_POLL_INTERVAL_MS : false;
    },
  });
}

export function useRunMutations(
  projectName: MaybeRef<string>,
  runKey: MaybeRef<string>,
  branch: MaybeRef<string | undefined>,
) {
  // Both writes act on the same run: finish changes its metadata (and therefore
  // the list's finished column), approve-all changes every comparison the run
  // groups, so its invalidation is the wider batch fan-out.
  const invalidate = (client: QueryClient) =>
    invalidateRun(client, unref(projectName), unref(runKey));

  const finish = useSdkMutation<RunStatusResultDto, void>({
    mutationFn: () => {
      const branchName = unref(branch);
      return runsControllerFinish({
        path: {
          projectName: unref(projectName),
          runKey: unref(runKey),
        },
        ...(branchName ? { query: { branch: branchName } } : {}),
      });
    },
    successMessage: "Run finished",
    errorMessage: "Could not finish the run",
    invalidate,
  });

  const approveAll = useSdkMutation<RunApproveAllResultDto, void>({
    mutationFn: () => {
      const branchName = unref(branch);
      return runsControllerApproveAll({
        path: {
          projectName: unref(projectName),
          runKey: unref(runKey),
        },
        ...(branchName ? { query: { branch: branchName } } : {}),
      });
    },
    // The batch answers partial results, so the success toast must say so: a
    // silent "approved" on a half-failed batch would be a lie.
    successMessage: (result) => {
      const failed = result.failed?.length ?? 0;
      if (result.approved === 0 && failed === 0)
        return "No pending comparisons";
      const partial = failed > 0 ? `, ${failed} failed` : "";
      return `Approved ${result.approved} comparison${result.approved === 1 ? "" : "s"}${partial}`;
    },
    errorMessage: "Could not approve the run's pending comparisons",
    invalidate: (client) =>
      invalidateAfterRunApproveAll(client, unref(projectName), unref(runKey)),
  });

  return { finish, approveAll };
}
