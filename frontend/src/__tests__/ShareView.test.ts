import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import ShareView from "@/views/ShareView.vue";
import type { PublicShareDto } from "@sdk";
import { TEST_ID } from "@/lib/test-ids";

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));

vi.mock("@sdk", () => ({
  publicShareControllerResolve: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { token: "tok-1" }, query: {} }),
}));

function projectShare(overrides: Partial<PublicShareDto> = {}): PublicShareDto {
  return {
    scope: "PROJECT",
    projectName: "checkout",
    testName: null,
    branchName: null,
    runKey: null,
    expiresAt: "2026-10-08T10:00:00.000Z",
    project: { name: "checkout" },
    tests: [
      {
        name: "login",
        kind: "image",
        status: "PENDING_APPROVAL",
        branchName: "main",
      },
      {
        name: "invoice",
        kind: "pdf",
        status: "APPROVED",
        branchName: null,
      },
    ],
    ...overrides,
  };
}

function testShare(): PublicShareDto {
  return {
    scope: "TEST",
    projectName: "checkout",
    testName: "login",
    branchName: "main",
    runKey: null,
    expiresAt: "2026-10-08T10:00:00.000Z",
    project: { name: "checkout" },
    test: {
      name: "login",
      kind: "pdf",
      status: "PENDING_APPROVAL",
      branchName: "main",
      variantCount: 4,
    },
  };
}

function runShare(): PublicShareDto {
  return {
    scope: "RUN",
    projectName: "checkout",
    testName: null,
    branchName: "main",
    runKey: "ci-42",
    expiresAt: "2026-10-08T10:00:00.000Z",
    project: { name: "checkout" },
    run: {
      key: "ci-42",
      branchName: "main",
      state: "pending",
      finishedAt: null,
      counts: {
        pendingComparisons: 3,
        mutedPending: 2,
        pendingJobs: 1,
        failedJobs: 4,
        approved: 5,
        testCount: 6,
      },
    },
  };
}

function forbidden() {
  return {
    error: { status: 403, message: "Passphrase required" },
    response: { status: 403 },
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const wrapper = mount(ShareView);
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ShareView", () => {
  it("shows the passphrase form on 403 and resolves with the passphrase", async () => {
    mockResolve.mockResolvedValueOnce(forbidden());

    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.sharePassphrase}"]`).exists(),
      ).toBe(true),
    );
    expect(mockResolve).toHaveBeenCalledWith({
      path: { token: "tok-1" },
      body: {},
    });

    mockResolve.mockResolvedValueOnce({ data: projectShare() });
    await wrapper
      .get(`[data-testid="${TEST_ID.sharePassphrase}"]`)
      .setValue("secret");
    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.shareProjectTests}"]`).exists(),
      ).toBe(true),
    );
    expect(mockResolve).toHaveBeenLastCalledWith({
      path: { token: "tok-1" },
      body: { passphrase: "secret" },
    });
    expect(wrapper.text()).toContain("Read-only shared view");
    expect(wrapper.text()).toContain("checkout");
    expect(wrapper.text()).toContain("login");
    expect(wrapper.text()).toContain("invoice");
    expect(wrapper.text()).toContain("2 tests");
  });

  it("renders a project share with tests and their labels", async () => {
    mockResolve.mockResolvedValue({ data: projectShare() });

    const wrapper = mountView();
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.shareProjectTests}"]`).exists(),
      ).toBe(true),
    );

    expect(wrapper.text()).toContain("Image");
    expect(wrapper.text()).toContain("PDF");
    expect(wrapper.text()).toContain("Pending");
    expect(wrapper.text()).toContain("Approved");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.approveChanges}"]`).exists(),
    ).toBe(false);
  });

  it("renders a test share summary", async () => {
    mockResolve.mockResolvedValue({ data: testShare() });

    const wrapper = mountView();
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.shareTestSummary}"]`).exists(),
      ).toBe(true),
    );

    const summary = wrapper.get(`[data-testid="${TEST_ID.shareTestSummary}"]`);
    expect(summary.text()).toContain("login");
    expect(summary.text()).toContain("PDF");
    expect(summary.text()).toContain("Pending");
    expect(summary.text()).toContain("main");
    expect(summary.text()).toContain("4");
  });

  it("renders a run share with every count, including muted", async () => {
    mockResolve.mockResolvedValue({ data: runShare() });

    const wrapper = mountView();
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.shareRunSummary}"]`).exists(),
      ).toBe(true),
    );

    const summary = wrapper.get(`[data-testid="${TEST_ID.shareRunSummary}"]`);
    expect(summary.text()).toContain("ci-42");
    expect(summary.text()).toContain("Pending");
    expect(summary.text()).toContain("Muted pending");
    expect(summary.text()).toContain("3");
    expect(summary.text()).toContain("2");
    expect(summary.text()).toContain("6");
  });

  it("shows the friendly not-found page for 404", async () => {
    mockResolve.mockResolvedValue({
      error: { status: 404, message: "Not found" },
      response: { status: 404 },
    });

    const wrapper = mountView();
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.shareError}"]`).exists(),
      ).toBe(true),
    );

    expect(
      wrapper.get(`[data-testid="${TEST_ID.shareError}"]`).text(),
    ).toContain("not available");
    expect(wrapper.text()).toContain("expired or been revoked");
  });

  it("shows an error page when the resolve fails unexpectedly", async () => {
    mockResolve.mockRejectedValue(new Error("network down"));

    const wrapper = mountView();
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.shareError}"]`).exists(),
      ).toBe(true),
    );

    expect(wrapper.text()).toContain("Could not load the share");
  });
});
