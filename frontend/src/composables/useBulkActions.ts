import { translateMessage as tm } from "@/lib/i18n-messages";
import { unref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  bulkActionsControllerApprove,
  bulkActionsControllerDeleteTests,
  projectsBulkControllerMove,
  type BulkApprovalResultDto,
  type BulkDeleteResultDto,
  type BulkMoveResultDto,
} from "@sdk";
import {
  mapBulkApproveResult,
  mapBulkDeleteResult,
  mapBulkMoveResult,
  mergeBulkApproveResults,
} from "@/domains/bulk-actions/bulk-action.mapper";
import type {
  BulkApproveResult,
  BulkApproveSelection,
  BulkDeleteResult,
  BulkMoveResult,
} from "@/domains/bulk-actions/bulk-action.model";
import { unwrapSdkData } from "@/lib/sdk";
import type { MaybeRef } from "@/composables/useDomainQuery";
import {
  invalidateAfterBulkApprove,
  invalidateAfterBulkMove,
  invalidateAfterBulkTestDelete,
} from "@/lib/invalidation";

// The approve endpoint is per project (max 100 ids), so a selection spanning
// projects is one request per project and the answers are merged into a single
// result. Sequential on purpose: the calls are small and a per-project failure
// should not abandon the projects already approved.
export function useBulkApproveSelection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      selections: readonly BulkApproveSelection[],
    ): Promise<BulkApproveResult> => {
      const results: BulkApproveResult[] = [];
      for (const selection of selections) {
        if (selection.comparisonIds.length === 0) continue;
        const response = await bulkActionsControllerApprove({
          path: { projectName: selection.projectName },
          body: { comparisonIds: [...selection.comparisonIds] },
        });
        const payload = unwrapSdkData<BulkApprovalResultDto>(
          response,
          "Could not approve the selected changes",
        );
        if (!payload) throw new Error("The bulk approval returned no result");
        results.push(mapBulkApproveResult(payload));
      }
      return mergeBulkApproveResults(results);
    },
    onSuccess: (result) => {
      invalidateAfterBulkApprove(queryClient);
      const parts = [
        tm("toast.bulkApproved", { count: result.approved.length }),
      ];
      if (result.failed.length > 0) {
        parts.push(tm("toast.failedCount", { count: result.failed.length }));
      }
      toast.success(parts.join(", "));
    },
    onError: () => {
      toast.error(tm("toast.bulkApproveError"));
    },
  });
}

export function useBulkMoveProjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      projectNames: string[];
      groupId: string | null;
    }): Promise<BulkMoveResult> => {
      const response = await projectsBulkControllerMove({
        body: {
          projectNames: [...input.projectNames],
          groupId: input.groupId,
        },
      });
      const payload = unwrapSdkData<BulkMoveResultDto>(
        response,
        "Could not move the selected projects",
      );
      if (!payload) throw new Error("The bulk move returned no result");
      return mapBulkMoveResult(payload);
    },
    onSuccess: (result) => {
      invalidateAfterBulkMove(queryClient);
      toast.success(
        `${tm("toast.bulkMoved", { count: result.moved.length })}${
          result.failed.length > 0
            ? tm("toast.failedSuffix", { count: result.failed.length })
            : ""
        }`,
      );
    },
    onError: () => {
      toast.error(tm("toast.bulkMoveError"));
    },
  });
}

// Bulk deletion is per project and one branch: the delete endpoint takes test
// names, so the selection is the tests the table's groups render, not their
// variant rows. The branch travels with the request because two branches can
// carry the same test name.
export function useBulkDeleteTests(options: {
  projectName: MaybeRef<string>;
  branchName?: MaybeRef<string | undefined>;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      testNames: readonly string[],
    ): Promise<BulkDeleteResult> => {
      const branch = unref(options.branchName);
      const response = await bulkActionsControllerDeleteTests({
        path: { projectName: unref(options.projectName) },
        body: {
          testNames: [...testNames],
          ...(branch ? { branch } : {}),
        },
      });
      const payload = unwrapSdkData<BulkDeleteResultDto>(
        response,
        "Could not delete the selected tests",
      );
      if (!payload) throw new Error("The bulk delete returned no result");
      return mapBulkDeleteResult(payload);
    },
    onSuccess: (result) => {
      invalidateAfterBulkTestDelete(queryClient, unref(options.projectName));
      toast.success(
        `${tm("toast.bulkDeleted", { count: result.deleted.length })}${
          result.failed.length > 0
            ? tm("toast.failedSuffix", { count: result.failed.length })
            : ""
        }`,
      );
    },
    onError: () => {
      toast.error(tm("toast.bulkDeleteError"));
    },
  });
}
