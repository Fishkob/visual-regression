import { computed, unref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { useInfiniteQuery } from "@tanstack/vue-query";
import {
  reviewCommentControllerCreate,
  reviewCommentControllerList,
  reviewCommentControllerResolve,
  type CommentDto,
} from "@sdk";
import { unwrapSdkData } from "@/lib/sdk";
import { translateMessage as tm } from "@/lib/i18n-messages";
import { useSdkMutation } from "@/composables/useSdkMutation";
import type { MaybeRef } from "@/composables/useDomainQuery";
import { mapComment, mapComments } from "@/domains/comments/comment.mapper";
import {
  COMMENT_PAGE_SIZE,
  type CreateReviewCommentInput,
  type ReviewComment,
} from "@/domains/comments/comment.model";
import {
  commentQueryKeys,
  type CommentListFilters,
} from "@/domains/comments/query-keys";

function invalidate(client: QueryClient) {
  client.invalidateQueries({ queryKey: commentQueryKeys.lists() });
}

// The thread is read newest-first and paged by cursor. A page that comes back
// full may have an older neighbour — that is the only signal an array response
// carries — so `hasOlder` is exactly "the last page filled the window", and the
// thread end is a short (or empty) page. Pages are held newest-first and
// stitched in reverse so the panel still renders one chronological list.
export function useReviewComments(
  projectName: MaybeRef<string>,
  testName: MaybeRef<string>,
  branch: MaybeRef<string | undefined>,
  comparisonId: MaybeRef<string | undefined>,
  onlyComparison: MaybeRef<boolean>,
) {
  const filters = computed<CommentListFilters>(() => {
    const scopedComparison = unref(onlyComparison)
      ? unref(comparisonId)
      : undefined;
    const scopedBranch = unref(branch);
    return {
      ...(scopedComparison ? { comparisonId: scopedComparison } : {}),
      ...(scopedBranch ? { branch: scopedBranch } : {}),
    };
  });

  const enabled = computed(() =>
    Boolean(unref(projectName) && unref(testName)),
  );

  const query = useInfiniteQuery({
    queryKey: computed(() =>
      enabled.value
        ? commentQueryKeys.list(
            unref(projectName),
            unref(testName),
            filters.value,
          )
        : [],
    ),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await reviewCommentControllerList({
        path: {
          projectName: unref(projectName),
          testName: unref(testName),
        },
        query: {
          ...filters.value,
          limit: COMMENT_PAGE_SIZE,
          ...(pageParam ? { before: pageParam } : {}),
        },
      });
      return mapComments(unwrapSdkData<CommentDto[]>(response));
    },
    getNextPageParam: (lastPage) =>
      lastPage.length === COMMENT_PAGE_SIZE ? lastPage[0]?.id : undefined,
  });

  // Pages arrive newest-first, each page oldest→newest inside; reversing the
  // page order before flattening keeps the thread chronological.
  const comments = computed<ReviewComment[]>(() =>
    [...(query.data.value?.pages ?? [])].reverse().flat(),
  );

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
        query: unref(branch) ? { branch: unref(branch) } : undefined,
      }),
    successMessage: tm("comments.resolvedToast"),
    errorMessage: tm("comments.resolveError"),
    invalidate: (client) => invalidate(client),
  });

  return {
    data: comments,
    isLoading: computed(() => query.isLoading.value),
    error: computed(() => query.error.value),
    refetch: query.refetch,
    hasOlder: computed(() => query.hasNextPage.value),
    isFetchingOlder: computed(() => query.isFetchingNextPage.value),
    fetchOlder: () => query.fetchNextPage(),
    create,
    resolve,
    mapCreated: (dto: CommentDto | undefined) => mapComment(dto as CommentDto),
  };
}
