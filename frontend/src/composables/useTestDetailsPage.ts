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
import type { ApprovalDecision } from "@/domains/approvals/approval-reason";
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
    branchName: Ref<string | undefined>,
    filters: Ref<VariantParams>,
  ) => DetailsQuery<D>;
  approve: (
    projectName: string,
    testName: string,
    comparisonId: string,
    branchName: string | undefined,
    decision?: ApprovalDecision,
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
  branchName: Ref<string | undefined>,
  filters: Ref<VariantParams>,
) {
  return useSdkQuery({
    args: { projectName, testName, branchName, filters },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, branchName, filters }) =>
      visualTestQueryKeys.details({
        projectName,
        testName,
        branch: branchName,
        ...filters,
      }),
    sdkFn: ({ projectName, testName, branchName, filters }) =>
      testsQueriesControllerGetVisualTestDetails({
        path: { projectName, testName },
        query: { ...filters, ...(branchName ? { branch: branchName } : {}) },
      }),
    map: mapVisualTestDetails,
  });
}

export function usePdfDetailsQuery(
  projectName: Ref<string>,
  testName: Ref<string>,
  branchName: Ref<string | undefined>,
  filters: Ref<VariantParams>,
) {
  return useSdkQuery({
    args: { projectName, testName, branchName, filters },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, branchName, filters }) =>
      pdfTestQueryKeys.details({
        projectName,
        testName,
        branch: branchName,
        ...filters,
      }),
    sdkFn: ({ projectName, testName, branchName, filters }) =>
      pdfControllerGetPdfTestDetails({
        path: { projectName, testName },
        query: { ...filters, ...(branchName ? { branch: branchName } : {}) },
      }),
    map: mapPdfTestDetails,
  });
}

const IMAGE_ADAPTER: TestDetailsAdapter<VisualTestDetails> = {
  useDetailsQuery: useVisualDetailsQuery,
  approve: (projectName, testName, comparisonId, branchName, decision) =>
    approvalsControllerApproveVisualTest({
      path: { projectName, testName },
      ...(branchName ? { query: { branch: branchName } } : {}),
      body: {
        comparisonId,
        ...(decision?.reason ? { reason: decision.reason } : {}),
        ...(decision?.note ? { note: decision.note } : {}),
      },
    }),
  invalidateDetails: invalidateVisualTestDetails,
  // Strip the presign query so the remount key stays stable across refetches;
  // the comparison id already pins the artifact.
  viewKeyOf: (comparison) => comparison?.diffImageUrl?.split("?")[0] ?? "",
};

const PDF_ADAPTER: TestDetailsAdapter<PdfTestDetails> = {
  useDetailsQuery: usePdfDetailsQuery,
  approve: (projectName, testName, comparisonId, branchName, decision) =>
    approvalsControllerApprovePdfTest({
      path: { projectName, testName },
      ...(branchName ? { query: { branch: branchName } } : {}),
      body: {
        comparisonId,
        ...(decision?.reason ? { reason: decision.reason } : {}),
        ...(decision?.note ? { note: decision.note } : {}),
      },
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
  branchName: Ref<string | undefined>;
  filters: Ref<VariantParams>;
  returnToInbox?: Ref<boolean>;
  // A pass started from "My reviews" walks only the reviewer's assignments, so
  // the pending list (and its cache key) carries the flag too.
  assignedToMe?: Ref<boolean>;
}) {
  const { adapter, projectName, testName, branchName, filters, assignedToMe } =
    args;

  const { data, isLoading, error, refetch } = adapter.useDetailsQuery(
    projectName,
    testName,
    branchName,
    filters,
  );

  const hasComparison = computed(() => data.value?.comparison != null);
  const currentComparisonId = computed(() => data.value?.comparison?.id);

  const pendingEnabled = computed(
    () => !!projectName.value && hasComparison.value,
  );

  const pendingQuery = usePendingTestsQuery(
    projectName,
    branchName,
    pendingEnabled,
    assignedToMe,
  );
  const pendingTests = computed(() => pendingQuery.data.value ?? []);

  const { handleApprove, handleSkip, isApproving, progress } = useReviewSession(
    {
      projectName,
      testName,
      branchName,
      filters,
      pendingTests,
      currentComparisonId,
      approve: (comparisonId, decision) =>
        decision
          ? adapter.approve(
              projectName.value,
              testName.value,
              comparisonId,
              branchName.value,
              decision,
            )
          : adapter.approve(
              projectName.value,
              testName.value,
              comparisonId,
              branchName.value,
            ),
      invalidateDetails: adapter.invalidateDetails,
      returnToInbox: args.returnToInbox,
      ...(assignedToMe ? { assignedToMe } : {}),
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
  branchName: Ref<string | undefined>;
  filters: Ref<VariantParams>;
  returnToInbox?: Ref<boolean>;
  assignedToMe?: Ref<boolean>;
}) {
  return useKindDetailsPage({ ...args, adapter: IMAGE_ADAPTER });
}

export function usePdfTestDetailsPage(args: {
  projectName: Ref<string>;
  testName: Ref<string>;
  branchName: Ref<string | undefined>;
  filters: Ref<VariantParams>;
  returnToInbox?: Ref<boolean>;
  assignedToMe?: Ref<boolean>;
}) {
  return useKindDetailsPage({ ...args, adapter: PDF_ADAPTER });
}
