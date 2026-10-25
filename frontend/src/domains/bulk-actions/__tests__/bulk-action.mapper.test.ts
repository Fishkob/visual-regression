import { describe, expect, it } from "vitest";
import {
  mapBulkApproveResult,
  mapBulkDeleteResult,
  mapBulkItem,
  mapBulkMoveResult,
  mergeBulkApproveResults,
} from "../bulk-action.mapper";
import {
  bulkApproveSummary,
  bulkFailureRows,
  bulkMoveSummary,
} from "../bulk-action.model";

const item = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  success: true,
  ...overrides,
});

describe("mapBulkItem", () => {
  it("maps a successful item", () => {
    expect(mapBulkItem(item())).toEqual({
      id: "c-1",
      success: true,
      error: null,
    });
  });

  it("maps a failed item with its reason", () => {
    expect(
      mapBulkItem(item({ success: false, error: "comparison was superseded" })),
    ).toEqual({
      id: "c-1",
      success: false,
      error: "comparison was superseded",
    });
  });

  it("normalizes a missing error to null", () => {
    expect(mapBulkItem(item({ error: "" })).error).toBeNull();
  });
});

describe("mapBulkApproveResult", () => {
  it("maps both buckets", () => {
    expect(
      mapBulkApproveResult({
        approved: [item()],
        failed: [item({ id: "c-2", success: false, error: "boom" })],
      }),
    ).toEqual({
      approved: [{ id: "c-1", success: true, error: null }],
      failed: [{ id: "c-2", success: false, error: "boom" }],
    });
  });

  it("defaults a missing payload to empty buckets", () => {
    expect(mapBulkApproveResult(undefined)).toEqual({
      approved: [],
      failed: [],
    });
  });
});

describe("mapBulkMoveResult / mapBulkDeleteResult", () => {
  it("maps the move buckets", () => {
    expect(
      mapBulkMoveResult({
        moved: [item({ id: "checkout" })],
        failed: [item({ id: "admin", success: false, error: "group missing" })],
      }),
    ).toEqual({
      moved: [{ id: "checkout", success: true, error: null }],
      failed: [{ id: "admin", success: false, error: "group missing" }],
    });
  });

  it("maps the delete buckets", () => {
    expect(
      mapBulkDeleteResult({
        deleted: [item({ id: "cart" })],
        failed: [item({ id: "login", success: false, error: "conflict" })],
      }),
    ).toEqual({
      deleted: [{ id: "cart", success: true, error: null }],
      failed: [{ id: "login", success: false, error: "conflict" }],
    });
  });

  it("defaults missing payloads", () => {
    expect(mapBulkMoveResult(undefined)).toEqual({ moved: [], failed: [] });
    expect(mapBulkDeleteResult(undefined)).toEqual({
      deleted: [],
      failed: [],
    });
  });
});

describe("mergeBulkApproveResults", () => {
  it("merges the per-project answers into one result", () => {
    const merged = mergeBulkApproveResults([
      {
        approved: [{ id: "a", success: true, error: null }],
        failed: [{ id: "b", success: false, error: "boom" }],
      },
      {
        approved: [{ id: "c", success: true, error: null }],
        failed: [],
      },
    ]);

    expect(merged.approved.map((row) => row.id)).toEqual(["a", "c"]);
    expect(merged.failed.map((row) => row.id)).toEqual(["b"]);
  });

  it("returns empty buckets for no results", () => {
    expect(mergeBulkApproveResults([])).toEqual({
      approved: [],
      failed: [],
    });
  });
});

describe("bulk summaries", () => {
  it("counts approved changes with singular/plural wording", () => {
    expect(
      bulkApproveSummary({
        approved: [{ id: "a", success: true, error: null }],
        failed: [],
      }),
    ).toBe("Approved 1 change");
    expect(
      bulkApproveSummary({
        approved: [
          { id: "a", success: true, error: null },
          { id: "b", success: true, error: null },
        ],
        failed: [],
      }),
    ).toBe("Approved 2 changes");
  });

  it("includes the failed count when the batch was partial", () => {
    expect(
      bulkApproveSummary({
        approved: [{ id: "a", success: true, error: null }],
        failed: [{ id: "b", success: false, error: "boom" }],
      }),
    ).toBe("Approved 1 change, 1 failed");
  });

  it("counts moved projects", () => {
    expect(
      bulkMoveSummary({
        moved: [
          { id: "a", success: true, error: null },
          { id: "b", success: true, error: null },
        ],
        failed: [{ id: "c", success: false, error: "boom" }],
      }),
    ).toBe("Moved 2 projects, 1 failed");
  });
});

describe("bulkFailureRows", () => {
  it("looks up the captured label and keeps the id", () => {
    const rows = bulkFailureRows(
      [{ id: "c-2", success: false, error: "superseded" }],
      new Map([["c-2", "checkout · login"]]),
    );

    expect(rows).toEqual([
      { id: "c-2", label: "checkout · login", error: "superseded" },
    ]);
  });

  it("falls back to the id and a generic error", () => {
    const rows = bulkFailureRows(
      [{ id: "c-3", success: false, error: null }],
      new Map(),
    );

    expect(rows).toEqual([{ id: "c-3", error: "Unknown error" }]);
  });
});
