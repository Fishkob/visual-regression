import { aggregateVariantStatuses } from "@/domains/test-status";
import type { VisualTestItem } from "@/domains/projects/project.model";
import { groupRowsByTestName } from "@/domains/projects/group-rows-by-test-name";
import type { PdfProjectTest } from "./pdf-test.model";

// Single owner of the PDF-directory derivation: reduce the project payload's
// per-variant rows into distinct PDF tests. Each test keeps its first row's
// variant (so navigation can carry it) and its status is the aggregate of its
// variants' statuses — the same rule the backend persists, so the directory
// and the server cannot drift.
export function derivePdfProjectTests(
  rows: readonly VisualTestItem[],
): PdfProjectTest[] {
  return [...groupRowsByTestName(rows)].map(([name, items]) => {
    const first = items[0];
    return {
      name,
      status: aggregateVariantStatuses(items.map((r) => r.latestStatus)),
      viewport: first.viewport,
      browser: first.browser,
      environment: first.environment,
    };
  });
}
