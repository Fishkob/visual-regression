import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import RunDetailView from "@/views/RunDetailView.vue";
import { triggerDownload } from "@/lib/download";
import { TEST_ID } from "@/lib/test-ids";

const { mockDetail, mockFinish, mockApproveAll, mockFetch } = vi.hoisted(
  () => ({
    mockDetail: vi.fn(),
    mockFinish: vi.fn(),
    mockApproveAll: vi.fn(),
    mockFetch: vi.fn(),
  }),
);

vi.mock("@/lib/download", () => ({
  triggerDownload: vi.fn(),
}));

vi.mock("@sdk", () => ({
  runsControllerDetail: (...args: unknown[]) => mockDetail(...args),
  runsControllerFinish: (...args: unknown[]) => mockFinish(...args),
  runsControllerApproveAll: (...args: unknown[]) => mockApproveAll(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    params: { projectName: "checkout", runKey: "ci-42" },
    query: { branch: "main" },
  }),
  RouterLink: {
    props: ["to"],
    template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
  },
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function runDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    key: "ci-42",
    branchName: "main",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    commitMessage: "Fix the checkout button",
    ciUrl: "https://ci.example.com/builds/42",
    createdAt: minutesAgo(30),
    lastActivityAt: minutesAgo(5),
    finishedAt: null,
    finishedBy: null,
    ...overrides,
  };
}

function statusDto(overrides: Record<string, unknown> = {}) {
  return {
    state: "pending",
    pendingComparisons: 2,
    pendingJobs: 1,
    failedJobs: 0,
    approved: 1,
    testCount: 3,
    ...overrides,
  };
}

function pendingDto(overrides: Record<string, unknown> = {}) {
  return {
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
    createdAt: minutesAgo(4),
    ...overrides,
  };
}

function detailDto(overrides: Record<string, unknown> = {}) {
  return {
    run: runDto(),
    status: statusDto(),
    pending: [
      pendingDto(),
      pendingDto({
        comparisonId: "c-2",
        testName: "invoice",
        kind: "pdf",
        mismatchPixelCount: 0,
        mismatchPageCount: 3,
      }),
    ],
    approvals: [
      {
        comparisonId: "c-0",
        testName: "login",
        approvedBy: "ada",
        approvedAt: minutesAgo(10),
      },
    ],
    uploads: [],
    failedJobs: [],
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(RunDetailView, {
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: {
        DialogPortal: { template: "<slot />" },
        SelectPortal: { template: "<slot />" },
        AlertDialogPortal: { template: "<slot />" },
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForPendingRows(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.runPendingRow}"]`),
    ).toHaveLength(count),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The report endpoints are plain same-origin fetches, not SDK calls.
  vi.stubGlobal("fetch", (...args: unknown[]) => mockFetch(...args));
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => new Blob(["report-body"]),
  });
  mockDetail.mockResolvedValue({ data: detailDto() });
  mockFinish.mockResolvedValue({
    data: {
      run: runDto({
        finishedAt: minutesAgo(0),
        finishedBy: "ada",
      }),
      status: statusDto({ state: "passed", pendingComparisons: 0 }),
    },
  });
  mockApproveAll.mockResolvedValue({
    data: { approved: 1, failed: [] },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe("RunDetailView", () => {
  it("shows failed jobs with their error", async () => {
    mockDetail.mockResolvedValue({
      data: detailDto({
        status: statusDto({ state: "failed", failedJobs: 1 }),
        failedJobs: [
          {
            id: "job-1",
            testName: "cart",
            branchName: "main",
            error: "engine exploded",
            createdAt: minutesAgo(5),
          },
        ],
      }),
    });
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.runFailedJobRow}"]`),
      ).toHaveLength(1),
    );
    expect(wrapper.text()).toContain("cart");
    expect(wrapper.text()).toContain("engine exploded");
  });

  it("shows the state, the counts and the commit header", async () => {
    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.runStateBadge}"]`).exists(),
      ).toBe(true),
    );

    expect(wrapper.get(`[data-testid="${TEST_ID.runStateBadge}"]`).text()).toBe(
      "Pending",
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.runPendingCount}"]`).text(),
    ).toBe("2");

    const text = wrapper.text();
    expect(text).toContain("ci-42");
    expect(text).toContain("main");
    expect(text).toContain("0123456");
    expect(text).toContain("Fix the checkout button");
    expect(text).toContain("Created");
    expect(text).toContain("Pending jobs");
    expect(text).toContain("Failed jobs");
    expect(text).toContain("Approved");
    expect(text).toContain("Tests");

    const ciLink = wrapper.get('a[href="https://ci.example.com/builds/42"]');
    expect(ciLink.text()).toContain("CI run");

    await vi.waitFor(() =>
      expect(mockDetail).toHaveBeenCalledWith({
        path: { projectName: "checkout", runKey: "ci-42" },
        query: { branch: "main" },
      }),
    );
  });

  it("lists pending comparisons with a branch-scoped test link", async () => {
    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.runPendingRow}"]`);
    expect(rows[0].text()).toContain("checkout");
    expect(rows[0].text()).toContain("1280x720 / chromium / staging");
    expect(rows[0].text()).toContain("42 px");
    expect(rows[1].text()).toContain("invoice");
    expect(rows[1].text()).toContain("3 pages");

    const target = rows[0].get("a").attributes("data-to");
    expect(target).toContain('"name":"test-detail"');
    expect(target).toContain('"testName":"checkout"');
    expect(target).toContain('"branch":"main"');
  });

  it("lists approvals with the actor and the age", async () => {
    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.runApprovalRow}"]`);
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain("login");
    expect(rows[0].text()).toContain("approved by ada");
  });

  it("confirms approve-all, calls the SDK and reports partial failures", async () => {
    mockApproveAll.mockResolvedValue({
      data: {
        approved: 1,
        failed: [{ comparisonId: "c-2", error: "comparison was superseded" }],
      },
    });

    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    const approve = wrapper.get(`[data-testid="${TEST_ID.runApproveAll}"]`);
    expect(approve.attributes("disabled")).toBeUndefined();
    await approve.trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockApproveAll).toHaveBeenCalledWith({
        path: { projectName: "checkout", runKey: "ci-42" },
        query: { branch: "main" },
      }),
    );

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("comparison was superseded"),
    );
    expect(wrapper.text()).toContain("Some comparisons could not be approved");
    expect(toast.success).toHaveBeenCalledWith(
      "Approved 1 comparison, 1 failed",
    );
  });

  it("confirms finishing the run and calls the SDK", async () => {
    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    await wrapper.get(`[data-testid="${TEST_ID.runFinish}"]`).trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockFinish).toHaveBeenCalledWith({
        path: { projectName: "checkout", runKey: "ci-42" },
        query: { branch: "main" },
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Run finished"),
    );
  });

  it("disables finish for an already finished run and names the auto finisher", async () => {
    mockDetail.mockResolvedValue({
      data: detailDto({
        run: runDto({
          finishedAt: minutesAgo(60),
          finishedBy: "auto",
        }),
        status: statusDto({ state: "passed" }),
      }),
    });

    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.runFinish}"]`)
        .attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.text()).toContain("auto");
  });

  it("downloads the JUnit, HTML and CSV reports for the run's branch", async () => {
    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    const reports = [
      { id: TEST_ID.runReportJunit, format: "junit", file: "vrt-ci-42.xml" },
      { id: TEST_ID.runReportHtml, format: "html", file: "vrt-ci-42.html" },
      { id: TEST_ID.runReportCsv, format: "csv", file: "vrt-ci-42.csv" },
    ] as const;

    for (const report of reports) {
      await wrapper.get(`[data-testid="${report.id}"]`).trigger("click");

      await vi.waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/v1/projects/checkout/runs/ci-42/report/${report.format}?branch=main`,
        ),
      );
      await vi.waitFor(() =>
        expect(triggerDownload).toHaveBeenCalledWith(
          expect.any(Blob),
          report.file,
        ),
      );
    }

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("disables the report buttons while a download is in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    const junit = wrapper.get(`[data-testid="${TEST_ID.runReportJunit}"]`);
    await junit.trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper
          .get(`[data-testid="${TEST_ID.runReportCsv}"]`)
          .attributes("disabled"),
      ).toBeDefined(),
    );

    resolveFetch({ ok: true, blob: async () => new Blob(["report"]) });

    await vi.waitFor(() =>
      expect(
        wrapper
          .get(`[data-testid="${TEST_ID.runReportCsv}"]`)
          .attributes("disabled"),
      ).toBeUndefined(),
    );
  });

  it("shows a toast when a report download fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    await wrapper
      .get(`[data-testid="${TEST_ID.runReportHtml}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not download the HTML report",
      ),
    );
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it("disables approve-all when nothing is pending", async () => {
    mockDetail.mockResolvedValue({
      data: detailDto({
        status: statusDto({ pendingComparisons: 0 }),
        pending: [],
      }),
    });

    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.runApproveAll}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.runApproveAll}"]`)
        .attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.text()).toContain("No pending comparisons in this run.");
  });
});

describe("RunDetailView 4-eyes approve-all", () => {
  it("summarizes pending votes and never reports them as approved", async () => {
    mockApproveAll.mockResolvedValue({
      data: {
        approved: 0,
        pending: [{ comparisonId: "c-1", votes: 1, required: 2 }],
        failed: [],
      },
    });

    const wrapper = mountView();
    await waitForPendingRows(wrapper, 2);

    await wrapper
      .get(`[data-testid="${TEST_ID.runApproveAll}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "1 awaiting additional approval",
      ),
    );
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Waiting for additional approval"),
    );
    expect(wrapper.text()).toContain("c-1: 1 of 2 votes");
    expect(wrapper.text()).not.toContain("Approved 0 comparisons");
  });
});
