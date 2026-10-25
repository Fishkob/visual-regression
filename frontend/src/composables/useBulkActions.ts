import { translateMessage as tm } from "@/lib/i18n-messages";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  bulkActionsControllerApprove,
  projectsBulkControllerMove,
  type BulkApprovalResultDto,
  type BulkMoveResultDto,
} from "@sdk";
import {
  mapBulkApproveResult,
  mapBulkMoveResult,
  mergeBulkApproveResults,
} from "@/domains/bulk-actions/bulk-action.mapper";
import type {
  BulkApproveResult,
  BulkApproveSelection,
  BulkMoveResult,
} from "@/domains/bulk-actions/bulk-action.model";
import { unwrapSdkData } from "@/lib/sdk";
import {
  invalidateAfterBulkApprove,
  invalidateAfterBulkMove,
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
      if (result.pending.length > 0) {
        parts.push(
          tm("approval.awaitingCount", { count: result.pending.length }),
        );
      }
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
