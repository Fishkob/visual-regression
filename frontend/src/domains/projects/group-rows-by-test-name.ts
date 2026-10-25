import type { VisualTestItem } from "./project.model";

// Single owner of "reduce per-variant rows into distinct tests by name". Both
// the image tab and the PDF tab of the project page derive their test lists
// from the same per-variant payload, so the grouping rule (and the unnamed-row
// fallback) must not drift between them.
import { translateMessage as tm } from "@/lib/i18n-messages";

export const UNNAMED_TEST_LABEL = "Unnamed test";

export function groupRowsByTestName(
  rows: readonly VisualTestItem[],
): Map<string, VisualTestItem[]> {
  const byName = new Map<string, VisualTestItem[]>();
  for (const row of rows) {
    const name = row.name ?? tm("tables.unnamedTest");
    const items = byName.get(name);
    if (items) items.push(row);
    else byName.set(name, [row]);
  }
  return byName;
}
