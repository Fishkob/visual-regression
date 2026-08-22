import { computed, reactive } from "vue";
import { aggregateVariantStatuses, countPending } from "@/domains/test-status";
import { isPdfKind } from "@/domains/test-kind";
import type { PdfProjectTest } from "@/domains/pdf-test/pdf-test.model";
import type { VisualTestItem } from "@/domains/projects/project.model";
import { groupRowsByTestName } from "@/domains/projects/group-rows-by-test-name";
import { useProjectDetailQuery } from "@/composables/useProjects";
import type { MaybeRef } from "@/composables/useDomainQuery";

export type ProjectDetailTab = "screenshots" | "pdfs";

// The project-detail page's single seam: one data source — the project payload
// with per-variant rows for both kinds — split into the image and PDF lists the
// two tabs render. The PDF list used to come from a second endpoint whose model
// dropped the variant; both lists now derive from the same payload, so the page
// stops knowing about kind filtering, status aggregation, and dual query state.
export function useProjectDetailPage(
  projectName: MaybeRef<string | undefined>,
) {
  const projectQuery = useProjectDetailQuery(projectName);

  const project = projectQuery.data;

  const visualTests = computed<VisualTestItem[]>(
    () => project.value?.visualTests ?? [],
  );

  const imageTests = computed(() =>
    visualTests.value.filter((t) => !isPdfKind(t.kind)),
  );

  // Distinct PDF tests derived from the payload's per-variant rows: each row
  // keeps its variant (so navigation can carry it), and the test-level status
  // is the aggregate of its variants' statuses — the same rule the backend
  // persists, so the directory and the server cannot drift.
  const pdfTests = computed<PdfProjectTest[]>(() =>
    [
      ...groupRowsByTestName(
        visualTests.value.filter((row) => isPdfKind(row.kind)),
      ),
    ].map(([name, rows]) => {
      const first = rows[0];
      return {
        name,
        status: aggregateVariantStatuses(rows.map((r) => r.latestStatus)),
        viewport: first.viewport,
        browser: first.browser,
        environment: first.environment,
      };
    }),
  );

  const screenshotPendingCount = computed(() =>
    countPending(imageTests.value, (t) => t.latestStatus),
  );

  const pdfPendingCount = computed(() =>
    countPending(pdfTests.value, (t) => t.status),
  );

  return {
    project,
    imageTests,
    screenshotPendingCount,
    pdfPendingCount,
    pdfTests,
    activeTabState: reactive({
      isLoading: projectQuery.isLoading,
      error: projectQuery.error,
      refetch: projectQuery.refetch,
    }),
  };
}

export type ProjectDetailPageReturn = ReturnType<typeof useProjectDetailPage>;
