import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import CommentsPanel from "@/components/comments/CommentsPanel.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockList, mockCreate, mockResolve } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockResolve: vi.fn(),
}));

vi.mock("@sdk", () => ({
  reviewCommentControllerList: (...args: unknown[]) => mockList(...args),
  reviewCommentControllerCreate: (...args: unknown[]) => mockCreate(...args),
  reviewCommentControllerResolve: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function commentDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    projectName: "checkout",
    branchName: "main",
    testId: "t-1",
    comparisonId: "cmp-1",
    body: "The spacing changed here.\nIs this intended?",
    authorId: "u-1",
    author: "alice",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(CommentsPanel, {
    props: {
      projectName: "checkout",
      testName: "login",
      branch: "main",
      comparisonId: "cmp-1",
    },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

async function waitForComments(
  wrapper: ReturnType<typeof mountPanel>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.commentRow}"]`).length,
    ).toBe(count),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({
    data: [
      commentDto(),
      commentDto({
        id: "c-2",
        author: "bob",
        body: "Known flake.",
        resolvedAt: "2026-10-02T10:00:00.000Z",
        resolvedBy: "alice",
      }),
    ],
  });
  mockCreate.mockResolvedValue({ data: commentDto({ id: "c-3" }) });
  mockResolve.mockResolvedValue({
    data: commentDto({ resolvedAt: "2026-10-02T11:00:00.000Z" }),
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("CommentsPanel", () => {
  it("lists comments with authors, bodies and resolved state", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.commentRow}"]`);
    expect(rows[0].text()).toContain("alice");
    expect(rows[0].text()).toContain("The spacing changed here.");
    expect(rows[0].text()).toContain("Is this intended?");
    expect(
      rows[0].find(`[data-testid="${TEST_ID.commentResolve}"]`).exists(),
    ).toBe(true);

    expect(rows[1].text()).toContain("bob");
    expect(
      rows[1].find(`[data-testid="${TEST_ID.commentResolved}"]`).exists(),
    ).toBe(true);
    expect(rows[1].text()).toContain("Resolved by alice");
    expect(
      rows[1].find(`[data-testid="${TEST_ID.commentResolve}"]`).exists(),
    ).toBe(false);
    expect(mockList).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "main" },
    });
  });

  it("submits a comment for the selected comparison and clears the box", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    await wrapper
      .get(`[data-testid="${TEST_ID.commentsBody}"]`)
      .setValue("Looks intended");
    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        body: {
          body: "Looks intended",
          comparisonId: "cmp-1",
          branch: "main",
        },
      }),
    );
    await vi.waitFor(() =>
      expect(
        (
          wrapper.get(`[data-testid="${TEST_ID.commentsBody}"]`)
            .element as HTMLTextAreaElement
        ).value,
      ).toBe(""),
    );
  });

  it("resolves an unresolved comment", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    await wrapper
      .get(`[data-testid="${TEST_ID.commentResolve}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockResolve).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login", id: "c-1" },
      }),
    );
  });

  it("filters to the selected comparison when toggled", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);
    expect(mockList).toHaveBeenLastCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "main" },
    });

    await wrapper
      .get(`[data-testid="${TEST_ID.commentsOnlyComparison}"]`)
      .setValue(true);

    await vi.waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "main", comparisonId: "cmp-1" },
      }),
    );
  });

  it("shows the empty state when there are no comments", async () => {
    mockList.mockResolvedValue({ data: [] });
    const wrapper = mountPanel();
    await vi.waitFor(() =>
      expect(
        wrapper.get(`[data-testid="${TEST_ID.commentsToggle}"]`).text(),
      ).toContain("Comments"),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.commentsToggle}"]`)
      .trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("No comments yet"));
  });

  it("collapses an empty thread so it does not push the diff down", async () => {
    mockList.mockResolvedValue({ data: [] });
    const wrapper = mountPanel();

    const toggle = wrapper.get(`[data-testid="${TEST_ID.commentsToggle}"]`);
    await vi.waitFor(() => expect(mockList).toHaveBeenCalled());

    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentsBody}"]`).exists(),
    ).toBe(false);
    // Still discoverable through its header and count.
    expect(toggle.text()).toContain("Comments");
    expect(toggle.text()).toContain("0");
  });

  it("expands a thread that has comments", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.commentsToggle}"]`)
        .attributes("aria-expanded"),
    ).toBe("true");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentsBody}"]`).exists(),
    ).toBe(true);
  });

  it("keeps a reviewer's collapse choice when the thread reloads", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    const toggle = wrapper.get(`[data-testid="${TEST_ID.commentsToggle}"]`);
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("false");

    // A different branch loads another thread; the manual collapse wins over
    // the auto-expand.
    await wrapper.setProps({ branch: "feature/x" });
    await vi.waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "feature/x" },
      }),
    );
    expect(toggle.attributes("aria-expanded")).toBe("false");
  });
});
