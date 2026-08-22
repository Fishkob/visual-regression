import { computed, reactive } from "vue";
import { countPending } from "@/domains/test-status";
import { isPdfKind } from "@/domains/test-kind";
import { derivePdfProjectTests } from "@/domains/pdf-test/derive-pdf-project-tests";
import type { VisualTestItem } from "@/domains/projects/project.model";
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

  // Distinct PDF tests derived from the payload's per-variant rows — the rule
  // lives in the pdf-test domain next to the PdfProjectTest model, so the page
  // stays a declaration and the directory cannot drift from the details model.
  const pdfTests = computed(() =>
    derivePdfProjectTests(
      visualTests.value.filter((row) => isPdfKind(row.kind)),
    ),
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
