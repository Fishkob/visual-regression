import { describe, expect, it } from "vitest";
import type {
  PaginatedRunDto,
  RunDetailDto,
  RunPendingDto,
  RunStatusDto,
} from "@sdk";
import {
  mapRun,
  mapRunApprovalList,
  mapRunApproveAllResult,
  mapRunDetail,
  mapRunPage,
  mapRunPending,
  mapRunPendingList,
  mapRuns,
  mapRunStatus,
  type RunPendingSource,
  type RunSource,
} from "../run.mapper";
import { isRunLive, runFinishedLabel, shortCommitSha } from "../run.model";

const runDto = (overrides: Partial<RunSource> = {}): RunSource => ({
  id: "run-1",
  key: "ci-42",
  branchName: "main",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  commitMessage: "Fix the checkout button",
  ciUrl: "https://ci.example.com/builds/42",
  createdAt: "2026-10-20T10:00:00.000Z",
  lastActivityAt: "2026-10-20T10:05:00.000Z",
  finishedAt: null,
  finishedBy: null,
  ...overrides,
});

const statusDto = (overrides: Partial<RunStatusDto> = {}): RunStatusDto => ({
  state: "pending",
  pendingComparisons: 3,
  mutedPending: 1,
  pendingJobs: 1,
  failedJobs: 0,
  approved: 2,
  testCount: 4,
  ...overrides,
});

const pendingDto = (
  overrides: Partial<RunPendingSource> = {},
): RunPendingSource => ({
  comparisonId: "c-1",
  testName: "checkout",
  kind: "image",
  branchName: "main",
  variant: {
    viewport: "1280x720",
    browser: "chromium",
    environment: "staging",
  },
  mismatchPixelCount: 42,
  mismatchPageCount: null,
  createdAt: "2026-10-20T10:01:00.000Z",
  ...overrides,
});

const detailDto = (overrides: Partial<RunDetailDto> = {}): RunDetailDto => ({
  run: runDto() as RunDetailDto["run"],
  status: statusDto(),
  pending: [pendingDto() as unknown as RunPendingDto],
  approvals: [
    {
      comparisonId: "c-0",
      testName: "cart",
      approvedBy: "ada",
      approvedAt: "2026-10-20T09:00:00.000Z",
    },
  ],
  uploads: [],
  failedJobs: [],
  ...overrides,
});

describe("mapRun", () => {
  it("maps every field", () => {
    expect(mapRun(runDto())).toEqual({
      id: "run-1",
      key: "ci-42",
      branchName: "main",
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      commitMessage: "Fix the checkout button",
      ciUrl: "https://ci.example.com/builds/42",
      createdAt: "2026-10-20T10:00:00.000Z",
      lastActivityAt: "2026-10-20T10:05:00.000Z",
      finishedAt: null,
      finishedBy: null,
    });
  });

  it("maps a finished run and its actor", () => {
    const run = mapRun(
      runDto({ finishedAt: "2026-10-20T11:00:00.000Z", finishedBy: "ada" }),
    );

    expect(run.finishedAt).toBe("2026-10-20T11:00:00.000Z");
    expect(run.finishedBy).toBe("ada");
    expect(runFinishedLabel(run)).toBe("ada");
  });

  it("normalizes the free-form nullable columns", () => {
    const run = mapRun(
      runDto({
        commitSha: { unexpected: true },
        commitMessage: "",
        ciUrl: undefined,
        finishedAt: { unexpected: true },
        finishedBy: 7,
      }),
    );

    expect(run.commitSha).toBeNull();
    expect(run.commitMessage).toBeNull();
    expect(run.ciUrl).toBeNull();
    expect(run.finishedAt).toBeNull();
    expect(run.finishedBy).toBeNull();
    expect(runFinishedLabel(run)).toBe("—");
  });

  it("accepts Date columns from a direct call", () => {
    const run = mapRun(
      runDto({
        // The DTO types the column as a string; a direct call hands a Date over,
        // which the mapper normalizes too.
        createdAt: new Date("2026-10-20T10:00:00.000Z") as unknown as string,
        finishedAt: new Date("2026-10-20T11:00:00.000Z"),
      }),
    );

    expect(run.createdAt).toBe("2026-10-20T10:00:00.000Z");
    expect(run.finishedAt).toBe("2026-10-20T11:00:00.000Z");
  });
});

describe("mapRuns", () => {
  it("maps an undefined list to an empty list", () => {
    expect(mapRuns(undefined)).toEqual([]);
  });
});

describe("mapRunStatus", () => {
  it("maps the derived status and counts", () => {
    expect(mapRunStatus(statusDto())).toEqual({
      state: "pending",
      pendingComparisons: 3,
      mutedPending: 1,
      pendingJobs: 1,
      failedJobs: 0,
      approved: 2,
      testCount: 4,
    });
  });

  it("defaults a missing status to open and zero counts", () => {
    expect(mapRunStatus(undefined)).toEqual({
      state: "open",
      pendingComparisons: 0,
      mutedPending: 0,
      pendingJobs: 0,
      failedJobs: 0,
      approved: 0,
      testCount: 0,
    });
  });

  it("defaults an unknown state to open", () => {
    const dto = { state: "queued" } as unknown as RunStatusDto;
    expect(mapRunStatus(dto).state).toBe("open");
  });
});

describe("mapRunPending", () => {
  it("maps the row and its variant", () => {
    expect(mapRunPending(pendingDto())).toEqual({
      comparisonId: "c-1",
      testName: "checkout",
      kind: "image",
      branchName: "main",
      viewport: "1280x720",
      browser: "chromium",
      environment: "staging",
      mismatchPixelCount: 42,
      mismatchPageCount: null,
      createdAt: "2026-10-20T10:01:00.000Z",
    });
  });

  it("maps a pdf row's page count", () => {
    const row = mapRunPending(
      pendingDto({ kind: "pdf", mismatchPixelCount: 0, mismatchPageCount: 2 }),
    );

    expect(row.kind).toBe("pdf");
    expect(row.mismatchPageCount).toBe(2);
  });

  it("keeps an unknown kind and an empty variant absent", () => {
    const row = mapRunPending(pendingDto({ kind: "video", variant: {} }));

    expect(row.kind).toBeUndefined();
    expect(row.viewport).toBeUndefined();
    expect(row.browser).toBeUndefined();
    expect(row.environment).toBeUndefined();
  });

  it("maps an undefined list to an empty list", () => {
    expect(mapRunPendingList(undefined)).toEqual([]);
  });
});

describe("mapRunApprovalList", () => {
  it("maps an undefined list to an empty list", () => {
    expect(mapRunApprovalList(undefined)).toEqual([]);
  });

  it("preserves the newest-first order", () => {
    const approvals = mapRunApprovalList([
      {
        comparisonId: "new",
        testName: "t",
        approvedBy: "ada",
        approvedAt: "2026-10-22T10:00:00.000Z",
      },
      {
        comparisonId: "old",
        testName: "t",
        approvedBy: "ada",
        approvedAt: "2026-10-20T10:00:00.000Z",
      },
    ]);

    expect(approvals.map((row) => row.comparisonId)).toEqual(["new", "old"]);
  });
});

describe("mapRunDetail", () => {
  it("maps the run, status, pending rows and approvals", () => {
    const detail = mapRunDetail(detailDto());

    expect(detail?.run.key).toBe("ci-42");
    expect(detail?.status.state).toBe("pending");
    expect(detail?.pending).toHaveLength(1);
    expect(detail?.approvals).toHaveLength(1);
    expect(detail?.approvals[0].approvedBy).toBe("ada");
    expect(detail?.failedJobs).toEqual([]);
  });

  it("maps failed jobs", () => {
    const detail = mapRunDetail(
      detailDto({
        failedJobs: [
          {
            id: "job-1",
            testName: "cart",
            branchName: "main",
            error: "engine exploded",
            createdAt: "2026-10-20T10:00:00.000Z",
          },
        ],
      }),
    );

    expect(detail?.failedJobs).toEqual([
      {
        id: "job-1",
        testName: "cart",
        branchName: "main",
        error: "engine exploded",
        createdAt: "2026-10-20T10:00:00.000Z",
      },
    ]);
  });

  it("maps a missing payload to undefined", () => {
    expect(mapRunDetail(undefined)).toBeUndefined();
  });
});

describe("mapRunPage", () => {
  it("maps the page and its meta", () => {
    const page = mapRunPage({
      data: [runDto() as unknown as PaginatedRunDto["data"][number]],
      meta: {
        page: 2,
        limit: 20,
        total: 21,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].key).toBe("ci-42");
    expect(page.total).toBe(21);
    expect(page.page).toBe(2);
    expect(page.limit).toBe(20);
    expect(page.totalPages).toBe(2);
  });

  it("defaults a missing page to page 1", () => {
    expect(mapRunPage(undefined)).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 0,
      totalPages: 0,
    });
  });
});

describe("mapRunApproveAllResult", () => {
  it("maps the partial-failure list", () => {
    const result = mapRunApproveAllResult({
      approved: 2,
      pending: [{ comparisonId: "c-8", votes: 1, required: 2 }],
      failed: [{ comparisonId: "c-9", error: "comparison was superseded" }],
    });

    expect(result.approved).toBe(2);
    expect(result.pending).toEqual([
      { comparisonId: "c-8", votes: 1, required: 2 },
    ]);
    expect(result.failed).toEqual([
      { comparisonId: "c-9", error: "comparison was superseded" },
    ]);
  });

  it("normalizes a malformed failure entry", () => {
    const result = mapRunApproveAllResult({
      approved: 0,
      pending: [{ votes: 1 }],
      failed: [{ comparisonId: 1, error: "" }],
    });

    expect(result.pending).toEqual([
      { comparisonId: "", votes: 1, required: 0 },
    ]);
    expect(result.failed).toEqual([
      { comparisonId: "", error: "Unknown error" },
    ]);
  });

  it("defaults a missing result to an empty batch", () => {
    expect(mapRunApproveAllResult(undefined)).toEqual({
      approved: 0,
      pending: [],
      failed: [],
    });
  });
});

describe("run display helpers", () => {
  it("labels the auto-finisher as auto", () => {
    expect(
      runFinishedLabel({
        finishedAt: "2026-10-20T11:00:00.000Z",
        finishedBy: "auto",
      }),
    ).toBe("auto");
  });

  it("shortens a commit sha and keeps a missing one", () => {
    expect(shortCommitSha("0123456789abcdef")).toBe("0123456");
    expect(shortCommitSha(null)).toBe("—");
  });

  it("only treats open and pending as live", () => {
    expect(isRunLive("open")).toBe(true);
    expect(isRunLive("pending")).toBe(true);
    expect(isRunLive("failed")).toBe(false);
    expect(isRunLive("passed")).toBe(false);
    expect(isRunLive(undefined)).toBe(false);
  });
});
