import { computed, type Ref } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import {
  approvalsControllerApprovePdfTest,
  approvalsControllerApproveVisualTest,
  pdfControllerGetPdfTestDetails,
  testsQueriesControllerGetVisualTestDetails,
} from "@sdk";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import type { PdfTestDetails } from "@/domains/pdf-test/pdf-test.model";
import type { VisualTestDetails } from "@/domains/visual-test/visual-test.model";
import { mapPdfTestDetails } from "@/domains/pdf-test/pdf-test.mapper";
import { mapVisualTestDetails } from "@/domains/visual-test/visual-test.mapper";
import {
  viewKeyOf,
  type TestDetailsArgs,
  type VariantParams,
} from "@/lib/variant-key";
import {
  invalidatePdfTestDetails,
  invalidateVisualTestDetails,
} from "@/lib/invalidation";
import { useSdkQuery } from "@/composables/useDomainQuery";
import { useReviewSession } from "@/composables/useReviewSession";
import { usePendingTestsQuery } from "@/composables/usePendingTests";

// The reviewable-details query surface both kinds share: the detail query plus
// the approve/skip session wiring. Declared once here so the shell below and
// any future consumer type against the same shape.
interface DetailsQuery<D> {
  data: Ref<D | null | undefined>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
}

// The per-kind variance of the reviewable details page: the query, the approve
// endpoint, the invalidation, and the comparison remount key. Everything else —
// the review session, pending list, approve/skip wiring — is the shared
// useKindDetailsPage shell.
interface TestDetailsAdapter<
  D extends { comparison?: { id?: string } | null },
> {
  useDetailsQuery: (
    projectName: Ref<string>,
    testName: Ref<string>,
    filters: Ref<VariantParams>,
  ) => DetailsQuery<D>;
  approve: (
    projectName: string,
    testName: string,
    comparisonId: string,
  ) => Promise<unknown>;
  invalidateDetails: (client: QueryClient, args: TestDetailsArgs) => void;
  // The kind-specific artifact that forces a fresh comparison panel when it
  // changes (image: diff image URL, PDF: diff PDF URL). A third kind supplies
  // its own key here instead of the shell casting for it.
  viewKeyOf: (comparison: D["comparison"] | null | undefined) => string;
}

export function useVisualDetailsQuery(
  projectName: Ref<string>,
  testName: Ref<string>,
  filters: Ref<VariantParams>,
) {
  return useSdkQuery({
    args: { projectName, testName, filters },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, filters }) =>
      visualTestQueryKeys.details({ projectName, testName, ...filters }),
    sdkFn: ({ projectName, testName, filters }) =>
      testsQueriesControllerGetVisualTestDetails({
        path: { projectName, testName },
        query: { ...filters },
      }),
    map: mapVisualTestDetails,
  });
}

export function usePdfDetailsQuery(
  projectName: Ref<string>,
  testName: Ref<string>,
  filters: Ref<VariantParams>,
) {
  return useSdkQuery({
    args: { projectName, testName, filters },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, filters }) =>
      pdfTestQueryKeys.details({ projectName, testName, ...filters }),
    sdkFn: ({ projectName, testName, filters }) =>
      pdfControllerGetPdfTestDetails({
        path: { projectName, testName },
        query: { ...filters },
      }),
    map: mapPdfTestDetails,
  });
}

const IMAGE_ADAPTER: TestDetailsAdapter<VisualTestDetails> = {
  useDetailsQuery: useVisualDetailsQuery,
  approve: (projectName, testName, comparisonId) =>
    approvalsControllerApproveVisualTest({
      path: { projectName, testName },
      body: { comparisonId },
    }),
  invalidateDetails: invalidateVisualTestDetails,
  viewKeyOf: (comparison) => comparison?.diffImageUrl ?? "",
};

const PDF_ADAPTER: TestDetailsAdapter<PdfTestDetails> = {
  useDetailsQuery: usePdfDetailsQuery,
  approve: (projectName, testName, comparisonId) =>
    approvalsControllerApprovePdfTest({
      path: { projectName, testName },
      body: { comparisonId },
    }),
  invalidateDetails: invalidatePdfTestDetails,
  viewKeyOf: (comparison) => comparison?.diffPdfUrl ?? "",
};

// The shared reviewable-details page driven by a per-kind adapter. Both kinds
// run through one shell + one review session; only the query, approve endpoint,
// invalidation, and remount key differ (the adapter). The viewKey is a remount
// key for the comparison panel so a changed comparison always produces a fresh
// panel. Exported so the shell has a direct test seam instead of being
// reachable only through the two per-kind wrappers.
export function useKindDetailsPage<
  D extends { comparison?: { id?: string } | null },
>(args: {
  adapter: TestDetailsAdapter<D>;
  projectName: Ref<string>;
  testName: Ref<string>;
  filters: Ref<VariantParams>;
  returnToInbox?: Ref<boolean>;
}) {
  const { adapter, projectName, testName, filters } = args;

  const { data, isLoading, error, refetch } = adapter.useDetailsQuery(
    projectName,
    testName,
    filters,
  );

  const hasComparison = computed(() => data.value?.comparison != null);
  const currentComparisonId = computed(() => data.value?.comparison?.id);

  const pendingEnabled = computed(
    () => !!projectName.value && hasComparison.value,
  );

  const pendingQuery = usePendingTestsQuery(projectName, pendingEnabled);
  const pendingTests = computed(() => pendingQuery.data.value ?? []);

  const { handleApprove, handleSkip, isApproving, progress } = useReviewSession(
    {
      projectName,
      testName,
      filters,
      pendingTests,
      currentComparisonId,
      approve: (comparisonId) =>
        adapter.approve(projectName.value, testName.value, comparisonId),
      invalidateDetails: adapter.invalidateDetails,
      returnToInbox: args.returnToInbox,
    },
  );

  const viewKey = computed(() =>
    viewKeyOf({
      projectName: projectName.value,
      testName: testName.value,
      filters: filters.value,
      comparison: data.value?.comparison,
      artifactUrl: adapter.viewKeyOf(data.value?.comparison ?? null),
    }),
  );

  return {
    data,
    isLoading,
    error,
    refetch,
    handleApprove,
    handleSkip,
    isApproving,
    progress,
    viewKey,
  };
}

export function useVisualTestDetailsPage(args: {
  projectName: Ref<string>;
  testName: Ref<string>;
  filters: Ref<VariantParams>;
  returnToInbox?: Ref<boolean>;
}) {
  return useKindDetailsPage({ ...args, adapter: IMAGE_ADAPTER });
}

export function usePdfTestDetailsPage(args: {
  projectName: Ref<string>;
  testName: Ref<string>;
  filters: Ref<VariantParams>;
  returnToInbox?: Ref<boolean>;
}) {
  return useKindDetailsPage({ ...args, adapter: PDF_ADAPTER });
}
