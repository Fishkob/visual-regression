import { describe, it, expect } from "vitest";
import { derivePdfProjectTests } from "@/domains/pdf-test/derive-pdf-project-tests";
import type { VisualTestItem } from "@/domains/projects/project.model";

function pdfRow(overrides: Partial<VisualTestItem> = {}): VisualTestItem {
  return {
    name: "invoice",
    kind: "pdf",
    viewport: "1920x1080",
    browser: "chrome",
    environment: "prod",
    latestStatus: "UNCHANGED",
    ...overrides,
  };
}

describe("derivePdfProjectTests", () => {
  it("groups per-variant rows into distinct tests by name", () => {
    const rows = [
      pdfRow({ name: "invoice" }),
      pdfRow({ name: "invoice", viewport: "1280x720" }),
      pdfRow({ name: "receipt" }),
    ];

    const tests = derivePdfProjectTests(rows);

    expect(tests.map((t) => t.name)).toEqual(["invoice", "receipt"]);
  });

  it("aggregates a test's status across its variants (pending wins)", () => {
    const rows = [
      pdfRow({ latestStatus: "UNCHANGED" }),
      pdfRow({ viewport: "1280x720", latestStatus: "PENDING_APPROVAL" }),
    ];

    const tests = derivePdfProjectTests(rows);

    expect(tests[0].status).toBe("PENDING_APPROVAL");
  });

  it("carries the first row's variant so navigation can use it", () => {
    const rows = [
      pdfRow({ viewport: "1920x1080", browser: "chrome", environment: "prod" }),
      pdfRow({
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      }),
    ];

    const tests = derivePdfProjectTests(rows);

    expect(tests[0]).toMatchObject({
      viewport: "1920x1080",
      browser: "chrome",
      environment: "prod",
    });
  });

  it("returns an empty list for no rows", () => {
    expect(derivePdfProjectTests([])).toEqual([]);
  });
});
