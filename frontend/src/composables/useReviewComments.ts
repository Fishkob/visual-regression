import { unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import {
  reviewCommentControllerCreate,
  reviewCommentControllerList,
  reviewCommentControllerResolve,
  type CommentDto,
} from "@sdk";
import { translateMessage as tm } from "@/lib/i18n-messages";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { mapComment, mapComments } from "@/domains/comments/comment.mapper";
import type {
  CreateReviewCommentInput,
  ReviewComment,
} from "@/domains/comments/comment.model";
import {
  commentQueryKeys,
  type CommentListFilters,
} from "@/domains/comments/query-keys";

function invalidate(client: QueryClient) {
  client.invalidateQueries({ queryKey: commentQueryKeys.lists() });
}

export function useReviewComments(
  projectName: MaybeRef<string>,
  testName: MaybeRef<string>,
  branch: MaybeRef<string | undefined>,
  comparisonId: MaybeRef<string | undefined>,
  onlyComparison: MaybeRef<boolean>,
) {
  const query = useSdkQuery({
    // The generated list DTO still marks both query members as required, while
    // the endpoint treats them as optional filters. Build only the supplied
    // members and cast at the SDK seam so an "all comments" read sends neither.
    args: {
      projectName,
      testName,
      branch,
      comparisonId,
      onlyComparison,
    },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, branch, comparisonId, onlyComparison }) =>
      commentQueryKeys.list(projectName, testName, {
        ...(onlyComparison && comparisonId ? { comparisonId } : {}),
        ...(branch ? { branch } : {}),
      }),
    sdkFn: ({ projectName, testName, branch, comparisonId, onlyComparison }) =>
      reviewCommentControllerList({
        path: { projectName, testName },
        query: {
          ...(onlyComparison && comparisonId ? { comparisonId } : {}),
          ...(branch ? { branch } : {}),
        } as unknown as CommentListFilters as {
          comparisonId: string;
          branch: string;
        },
      }),
    map: (dtos: CommentDto[] | undefined) => mapComments(dtos),
  });

  const create = useSdkMutation<CommentDto, CreateReviewCommentInput>({
    mutationFn: (input) =>
      reviewCommentControllerCreate({
        path: {
          projectName: unref(projectName),
          testName: unref(testName),
        },
        body: {
          body: input.body,
          ...(input.comparisonId ? { comparisonId: input.comparisonId } : {}),
          ...(input.branch ? { branch: input.branch } : {}),
        },
      }),
    successMessage: tm("comments.created"),
    errorMessage: tm("comments.createError"),
    invalidate: (client) => invalidate(client),
  });

  const resolve = useSdkMutation<CommentDto, string>({
    mutationFn: (id) =>
      reviewCommentControllerResolve({
        path: {
          projectName: unref(projectName),
          testName: unref(testName),
          id,
        },
      }),
    successMessage: tm("comments.resolvedToast"),
    errorMessage: tm("comments.resolveError"),
    invalidate: (client) => invalidate(client),
  });

  return {
    ...query,
    comments: query.data as unknown as ReviewComment[] | undefined,
    create,
    resolve,
    mapCreated: (dto: CommentDto | undefined) => mapComment(dto as CommentDto),
  };
}
