import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { nextTick } from "vue";
import { toast } from "vue-sonner";
import AuditView from "@/views/AuditView.vue";
import { Select } from "@/components/ui/select";
import { formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockExport } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockExport: vi.fn(),
}));

vi.mock("@sdk", () => ({
  auditControllerList: (...args: unknown[]) => mockList(...args),
  auditControllerExport: (...args: unknown[]) => mockExport(...args),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { template: "<a><slot /></a>" },
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const auditDto = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-1",
  actor: "jane.doe",
  action: "approval",
  projectName: "checkout",
  testName: "checkout-flow",
  branchName: "main",
  targetType: "test",
  targetId: "test-1",
  metadata: { viewport: "1920x1080", testKind: "image" },
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...overrides,
});

function pageOf(
  rows: unknown[],
  meta: Record<string, unknown> = {},
): { data: unknown } {
  return {
    data: {
      data: rows,
      meta: {
        page: 1,
        limit: 50,
        total: rows.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        ...meta,
      },
    },
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = mount(AuditView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { SelectPortal: { template: "<slot />" } },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

function rows(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAll(`[data-testid="${TEST_ID.auditRow}"]`);
}

async function waitForRows(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() => expect(rows(wrapper)).toHaveLength(count));
}

function listCalls(): { query?: Record<string, unknown> }[] {
  return mockList.mock.calls.map(
    ([arg]) => (arg ?? {}) as { query?: Record<string, unknown> },
  );
}

function lastListQuery(): Record<string, unknown> | undefined {
  const calls = listCalls();
  return calls.length > 0 ? calls[calls.length - 1]!.query : undefined;
}

// Same derivation as the view: the date inputs describe whole local days, so
// the request carries local midnight and local end-of-day as ISO strings.
const fromFilter = "2026-01-01";
const toFilter = "2026-01-31";
const expectedFrom = new Date(`${fromFilter}T00:00:00`).toISOString();
const expectedTo = new Date(`${toFilter}T23:59:59.999`).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(pageOf([auditDto()]));
  mockExport.mockResolvedValue({ data: "createdAt,actor\n" });
});

afterEach(async () => {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe("AuditView", () => {
  it("renders a row with actor, action label, project, test, target and details", async () => {
    const dto = auditDto();
    mockList.mockResolvedValue(pageOf([dto]));

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    const row = rows(wrapper)[0]!;
    expect(row.text()).toContain("jane.doe");
    expect(row.text()).toContain("Approval");
    expect(row.text()).toContain("checkout");
    expect(row.text()).toContain("checkout-flow");
    expect(row.text()).toContain("main");
    expect(row.text()).toContain("test checkout-flow");
    expect(row.text()).toContain(formatRelativeAge(dto.createdAt));

    const time = row.findAll("td")[0]!.get("span");
    expect(time.attributes("title")).toBe(
      new Date(dto.createdAt).toLocaleString(),
    );

    const details = row.get(`[data-testid="${TEST_ID.auditDetails}"]`);
    expect(details.text()).toBe("viewport 1920x1080 · testKind image");
    expect(details.attributes("title")).toBe(
      JSON.stringify({ viewport: "1920x1080", testKind: "image" }),
    );
  });

  it("names the target entity instead of showing its raw id", async () => {
    mockList.mockResolvedValue(pageOf([auditDto()]));

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    const row = rows(wrapper)[0]!;
    expect(row.text()).toContain("test checkout-flow");
    expect(row.text()).not.toContain("test-1");
  });

  it("abbreviates the id of a target without a denormalized name", async () => {
    mockList.mockResolvedValue(
      pageOf([
        auditDto({
          action: "review.comment",
          targetType: "comment",
          targetId: "cmvo9vus80008abcdefgh1234",
        }),
      ]),
    );

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    expect(rows(wrapper)[0]!.text()).toContain("comment cmvo9vus…");
  });

  it("labels the review and policy actions instead of their wire keys", async () => {
    mockList.mockResolvedValue(
      pageOf([
        auditDto({ id: "evt-1", action: "review.assign" }),
        auditDto({ id: "evt-2", action: "review.complete" }),
        auditDto({ id: "evt-3", action: "review.comment" }),
        auditDto({ id: "evt-4", action: "review.comment-resolve" }),
        auditDto({ id: "evt-5", action: "test.threshold" }),
      ]),
    );

    const wrapper = mountView();
    await waitForRows(wrapper, 5);

    const rendered = rows(wrapper).map((row) => row.text());
    expect(rendered[0]).toContain("Review assigned");
    expect(rendered[1]).toContain("Review completed");
    expect(rendered[2]).toContain("Review comment");
    expect(rendered[3]).toContain("Review comment resolved");
    expect(rendered[4]).toContain("Threshold changed");
    // No row leaks the raw key.
    for (const [index, text] of rendered.entries()) {
      const wire = [
        "review.assign",
        "review.complete",
        "review.comment",
        "review.comment-resolve",
        "test.threshold",
      ][index];
      expect(text).not.toContain(wire);
    }
  });

  it("renders a dash for every field a destroyed entity no longer has", async () => {
    mockList.mockResolvedValue(
      pageOf([
        auditDto({
          id: "evt-2",
          action: "test.delete",
          actor: null,
          projectName: null,
          testName: null,
          branchName: null,
          targetType: null,
          targetId: null,
          metadata: null,
        }),
      ]),
    );

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    const row = rows(wrapper)[0]!;
    expect(row.text()).toContain("Test deleted");
    expect(row.text()).toContain("—");

    const details = row.get(`[data-testid="${TEST_ID.auditDetails}"]`);
    expect(details.text()).toBe("—");
    expect(details.attributes("title")).toBeUndefined();
  });

  it("applies every filter and resets to page 1", async () => {
    mockList.mockResolvedValue(
      pageOf([auditDto()], {
        total: 120,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      }),
    );

    const wrapper = mountView();
    await waitForRows(wrapper, 1);
    expect(lastListQuery()).toEqual({ page: 1, limit: 50 });

    await wrapper
      .get(`[data-testid="${TEST_ID.paginationNext}"]`)
      .trigger("click");
    await vi.waitFor(() => expect(lastListQuery()).toMatchObject({ page: 2 }));

    await wrapper
      .get(`[data-testid="${TEST_ID.auditActorFilter}"]`)
      .setValue("jane.doe");
    await wrapper
      .get(`[data-testid="${TEST_ID.auditProjectFilter}"]`)
      .setValue("checkout");
    wrapper.getComponent(Select).vm.$emit("update:modelValue", "test.delete");
    await nextTick();
    await wrapper
      .get(`[data-testid="${TEST_ID.auditFromFilter}"]`)
      .setValue(fromFilter);
    await wrapper
      .get(`[data-testid="${TEST_ID.auditToFilter}"]`)
      .setValue(toFilter);

    await wrapper.get(`[data-testid="${TEST_ID.auditApply}"]`).trigger("click");

    await vi.waitFor(() =>
      expect(lastListQuery()).toEqual({
        actor: "jane.doe",
        action: "test.delete",
        projectName: "checkout",
        from: expectedFrom,
        to: expectedTo,
        page: 1,
        limit: 50,
      }),
    );
  });

  it("keeps the applied filters when paging forward", async () => {
    mockList.mockResolvedValue(
      pageOf([auditDto()], {
        total: 120,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      }),
    );

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.auditActorFilter}"]`)
      .setValue("jane.doe");
    await wrapper.get(`[data-testid="${TEST_ID.auditApply}"]`).trigger("click");
    await vi.waitFor(() =>
      expect(lastListQuery()).toEqual({
        actor: "jane.doe",
        page: 1,
        limit: 50,
      }),
    );
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.paginationNext}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(lastListQuery()).toEqual({
        actor: "jane.doe",
        page: 2,
        limit: 50,
      }),
    );
  });

  it("clears every filter and returns to page 1 on reset", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.auditActorFilter}"]`)
      .setValue("jane.doe");
    await wrapper.get(`[data-testid="${TEST_ID.auditApply}"]`).trigger("click");
    await vi.waitFor(() =>
      expect(lastListQuery()).toMatchObject({ actor: "jane.doe" }),
    );

    await wrapper.get(`[data-testid="${TEST_ID.auditReset}"]`).trigger("click");

    await vi.waitFor(() =>
      expect(lastListQuery()).toEqual({ page: 1, limit: 50 }),
    );
    expect(
      (
        wrapper.get(`[data-testid="${TEST_ID.auditActorFilter}"]`)
          .element as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("says so when no event matches the filters", async () => {
    mockList.mockResolvedValue(pageOf([]));

    const wrapper = mountView();

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.auditEmpty}"]`).exists(),
      ).toBe(true),
    );
    expect(wrapper.get(`[data-testid="${TEST_ID.auditEmpty}"]`).text()).toBe(
      "No audit events match these filters.",
    );
  });

  it("exports the applied filters as CSV and triggers a download", async () => {
    const downloads: string[] = [];
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:audit");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        const anchor =
          document.body.querySelector<HTMLAnchorElement>("a[download]");
        downloads.push(anchor?.download ?? "");
      });

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.auditActorFilter}"]`)
      .setValue("jane.doe");
    await wrapper.get(`[data-testid="${TEST_ID.auditApply}"]`).trigger("click");
    await vi.waitFor(() =>
      expect(lastListQuery()).toMatchObject({ actor: "jane.doe" }),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.auditExport}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockExport).toHaveBeenCalledWith({
        query: { actor: "jane.doe" },
        parseAs: "text",
      }),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Audit log exported"),
    );

    expect(createSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect((createSpy.mock.calls[0]![0] as Blob).type).toBe("text/csv");
    expect(clickSpy).toHaveBeenCalled();
    expect(downloads).toEqual(["audit.csv"]);
  });

  it("reports a failed export instead of downloading an empty file", async () => {
    mockExport.mockRejectedValue(new Error("boom"));
    const createSpy = vi.spyOn(URL, "createObjectURL");

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .get(`[data-testid="${TEST_ID.auditExport}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not export the audit log",
      ),
    );
    expect(createSpy).not.toHaveBeenCalled();
  });
});
