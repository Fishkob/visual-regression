import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import CommentsPanel from "@/components/comments/CommentsPanel.vue";
import { COMMENT_PAGE_SIZE } from "@/domains/comments/comment.model";
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

function lastCount(wrapper: {
  emitted: (name: string) => unknown[][] | undefined;
}) {
  const events = wrapper.emitted("update:count") ?? [];
  return events[events.length - 1];
}

function lastHasOlder(wrapper: {
  emitted: (name: string) => unknown[][] | undefined;
}) {
  const events = wrapper.emitted("update:hasOlder") ?? [];
  return events[events.length - 1];
}

function mountPanel(extraProps: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(CommentsPanel, {
    props: {
      projectName: "checkout",
      testName: "login",
      branch: "main",
      comparisonId: "cmp-1",
      ...extraProps,
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
        createdAt: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
        resolvedAt: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
        resolvedBy: "alice",
      }),
    ],
  });
  mockCreate.mockResolvedValue({ data: commentDto({ id: "c-3" }) });
  mockResolve.mockResolvedValue({
    data: commentDto({ resolvedAt: new Date().toISOString() }),
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("CommentsPanel", () => {
  it("lists open comments with their author, body and resolve action", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    const openRow = wrapper.findAll(
      `[data-testid="${TEST_ID.commentRow}"]`,
    )[0]!;
    expect(openRow.text()).toContain("alice");
    expect(openRow.text()).toContain("The spacing changed here.");
    expect(openRow.text()).toContain("Is this intended?");
    expect(
      openRow.find(`[data-testid="${TEST_ID.commentResolve}"]`).exists(),
    ).toBe(true);

    expect(mockList).toHaveBeenCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "main", limit: COMMENT_PAGE_SIZE },
    });
  });

  it("reports the whole thread size to the section header", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    // Resolved comments count too: the tab's number means "everything here",
    // which is what makes the collapsed group discoverable.
    await vi.waitFor(() => expect(lastCount(wrapper)).toEqual([2]));
  });

  it("folds resolved comments behind one toggle that starts collapsed", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    const toggle = wrapper.get(
      `[data-testid="${TEST_ID.commentsResolvedToggle}"]`,
    );
    expect(toggle.text()).toContain("Resolved (1)");
    expect(toggle.attributes("aria-expanded")).toBe("false");

    // The row is in the DOM (a reload must not lose it) but out of sight.
    const group = wrapper.get(
      `[data-testid="${TEST_ID.commentsResolvedGroup}"]`,
    );
    expect(group.attributes("style")).toContain("display: none");

    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(group.attributes("style") ?? "").not.toContain("display: none");

    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentResolved}"]`).exists(),
    ).toBe(true);
    const resolvedRow = wrapper.findAll(
      `[data-testid="${TEST_ID.commentRow}"]`,
    )[1]!;
    expect(resolvedRow.text()).toContain("bob");
    expect(resolvedRow.text()).toContain("Resolved by alice");
    expect(
      resolvedRow.find(`[data-testid="${TEST_ID.commentResolve}"]`).exists(),
    ).toBe(false);
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

  it("submits on Ctrl+Enter without leaving the textarea", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    const body = wrapper.get(`[data-testid="${TEST_ID.commentsBody}"]`);
    await body.setValue("Keyboard only");
    await body.trigger("keydown", { key: "Enter", ctrlKey: true });

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        body: {
          body: "Keyboard only",
          comparisonId: "cmp-1",
          branch: "main",
        },
      }),
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
        query: { branch: "main" },
      }),
    );
  });

  it("filters to the selected comparison when toggled", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);
    expect(mockList).toHaveBeenLastCalledWith({
      path: { projectName: "checkout", testName: "login" },
      query: { branch: "main", limit: COMMENT_PAGE_SIZE },
    });

    await wrapper
      .get(`[data-testid="${TEST_ID.commentsOnlyComparison}"]`)
      .setValue(true);

    await vi.waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: {
          branch: "main",
          comparisonId: "cmp-1",
          limit: COMMENT_PAGE_SIZE,
        },
      }),
    );
  });

  it("hides the composer and resolve action on an inherited test", async () => {
    const wrapper = mountPanel({ readOnly: true });
    await waitForComments(wrapper, 2);

    // The thread stays readable — it belongs to the ancestor's review.
    expect(wrapper.text()).toContain("The spacing changed here.");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentsBody}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentsSubmit}"]`).exists(),
    ).toBe(false);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentResolve}"]`).exists(),
    ).toBe(false);
  });

  it("shows the empty state when there are no comments", async () => {
    mockList.mockResolvedValue({ data: [] });
    const wrapper = mountPanel();

    await vi.waitFor(() => expect(wrapper.text()).toContain("No comments yet"));
    expect(lastCount(wrapper)).toEqual([0]);
  });

  it("offers no older page when the first page is short", async () => {
    const wrapper = mountPanel();
    await waitForComments(wrapper, 2);

    expect(lastHasOlder(wrapper)).toEqual([false]);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentsLoadOlder}"]`).exists(),
    ).toBe(false);
  });

  it("loads older comments through the cursor and stops at the thread end", async () => {
    // A full page is the only "there may be more" signal an array response
    // carries, so this is also the page that must offer the control.
    const fullPage = Array.from({ length: COMMENT_PAGE_SIZE }, (_, index) =>
      commentDto({ id: `c-${index}`, body: `comment ${index}` }),
    );
    mockList.mockResolvedValueOnce({ data: fullPage }).mockResolvedValueOnce({
      data: [commentDto({ id: "older", body: "First" })],
    });

    const wrapper = mountPanel();
    await waitForComments(wrapper, COMMENT_PAGE_SIZE);
    expect(lastHasOlder(wrapper)).toEqual([true]);

    await wrapper
      .get(`[data-testid="${TEST_ID.commentsLoadOlder}"]`)
      .trigger("click");

    // The cursor is the oldest comment of the page the panel already holds.
    await vi.waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: {
          branch: "main",
          limit: COMMENT_PAGE_SIZE,
          before: "c-0",
        },
      }),
    );

    // The older page is stitched in front, so the thread stays chronological.
    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.commentRow}"]`).length,
      ).toBe(COMMENT_PAGE_SIZE + 1),
    );
    const rows = wrapper.findAll(`[data-testid="${TEST_ID.commentRow}"]`);
    expect(rows[0]!.text()).toContain("First");

    // A short page is the thread end: the control is gone and the count is
    // exact again.
    expect(lastHasOlder(wrapper)).toEqual([false]);
    expect(
      wrapper.find(`[data-testid="${TEST_ID.commentsLoadOlder}"]`).exists(),
    ).toBe(false);
  });
});
