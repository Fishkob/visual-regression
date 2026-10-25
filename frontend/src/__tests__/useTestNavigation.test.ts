import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useTestNavigation } from "@/composables/useTestNavigation";
import { keyOf } from "@/lib/variant-key";
import { REVIEW_LOOP_NAV_STATE } from "@/lib/review-pass";

const mockPush = vi.fn();
const mockRoute = { query: {} as Record<string, unknown> };

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useRoute: () => mockRoute,
}));

describe("useTestNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.query = {};
  });

  const createOptions = (overrides = {}) => ({
    projectName: ref("test-project"),
    branchName: ref<string | undefined>(undefined),
    ...overrides,
  });

  describe("navigateToProjectDone", () => {
    it("navigates to project done page by route name", async () => {
      const { navigateToProjectDone } = useTestNavigation(createOptions());

      navigateToProjectDone();

      expect(mockPush).toHaveBeenCalledWith({
        name: "approval-done",
        params: { projectName: "test-project" },
      });
    });

    it("uses updated projectName when navigating", async () => {
      const projectName = ref("initial-project");
      const { navigateToProjectDone } = useTestNavigation({ projectName });

      projectName.value = "updated-project";
      navigateToProjectDone();

      expect(mockPush).toHaveBeenCalledWith({
        name: "approval-done",
        params: { projectName: "updated-project" },
      });
    });
  });

  describe("navigateToTest (direct entry)", () => {
    it("navigates to test detail with variant query params", () => {
      const { navigateToTest } = useTestNavigation(createOptions());

      navigateToTest({
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      });

      expect(mockPush).toHaveBeenCalledWith({
        name: "test-detail",
        params: { projectName: "test-project", testName: "login-form" },
        query: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
        },
      });
    });

    it("carries NO review-loop state — a direct entry starts a fresh pass", () => {
      const { navigateToTest } = useTestNavigation(createOptions());

      navigateToTest({
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      });

      expect(mockPush).toHaveBeenCalledWith(
        expect.not.objectContaining({ state: REVIEW_LOOP_NAV_STATE }),
      );
    });

    it("does not navigate when name is empty", () => {
      const { navigateToTest } = useTestNavigation(createOptions());

      navigateToTest({ name: "", viewport: "1920x1080" });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not navigate when name is undefined", () => {
      const { navigateToTest } = useTestNavigation(createOptions());

      navigateToTest({ viewport: "1920x1080" });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("carries the selected branch in the query", () => {
      const { navigateToTest } = useTestNavigation(
        createOptions({ branchName: ref<string | undefined>("feature/x") }),
      );

      navigateToTest({
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      });

      expect(mockPush).toHaveBeenCalledWith({
        name: "test-detail",
        params: { projectName: "test-project", testName: "login-form" },
        query: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
          branch: "feature/x",
        },
      });
    });

    it("carries the inbox kind/group scope so the pass keeps its filters", () => {
      mockRoute.query = { inboxKind: "pdf", inboxGroup: "group-1" };
      const { navigateToTest } = useTestNavigation(createOptions());

      navigateToTest({
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      });

      expect(mockPush).toHaveBeenCalledWith({
        name: "test-detail",
        params: { projectName: "test-project", testName: "login-form" },
        query: {
          viewport: "1920x1080",
          browser: "chrome",
          environment: "prod",
          inboxKind: "pdf",
          inboxGroup: "group-1",
        },
      });
    });

    it("omits the inbox scope when the route carries none", () => {
      const { navigateToTest } = useTestNavigation(createOptions());

      navigateToTest({
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      });

      const query = mockPush.mock.calls[0][0].query;
      expect(query).not.toHaveProperty("inboxKind");
      expect(query).not.toHaveProperty("inboxGroup");
    });

    it("ignores non-string or empty inbox scope values", () => {
      mockRoute.query = { inboxKind: ["image", "pdf"], inboxGroup: "" };
      const { navigateToTest } = useTestNavigation(createOptions());

      navigateToTest({ name: "login-form", viewport: "1920x1080" });

      const query = mockPush.mock.calls[0][0].query;
      expect(query).not.toHaveProperty("inboxKind");
      expect(query).not.toHaveProperty("inboxGroup");
    });
  });

  describe("navigateToNextTest (loop continuation)", () => {
    it("navigates with the review-loop state so skip-memory survives", () => {
      const { navigateToNextTest } = useTestNavigation(createOptions());

      navigateToNextTest({
        name: "signup-form",
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      });

      expect(mockPush).toHaveBeenCalledWith({
        name: "test-detail",
        params: { projectName: "test-project", testName: "signup-form" },
        query: {
          viewport: "1280x720",
          browser: "firefox",
          environment: "staging",
        },
        state: REVIEW_LOOP_NAV_STATE,
      });
    });

    it("does not navigate when name is empty", () => {
      const { navigateToNextTest } = useTestNavigation(createOptions());

      navigateToNextTest({ name: "", viewport: "1280x720" });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it("keeps the inbox kind/group scope for the whole pass", () => {
      mockRoute.query = { inboxKind: "image", inboxGroup: "group-1" };
      const { navigateToNextTest } = useTestNavigation(createOptions());

      navigateToNextTest({
        name: "signup-form",
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      });

      expect(mockPush).toHaveBeenCalledWith({
        name: "test-detail",
        params: { projectName: "test-project", testName: "signup-form" },
        query: {
          viewport: "1280x720",
          browser: "firefox",
          environment: "staging",
          inboxKind: "image",
          inboxGroup: "group-1",
        },
        state: REVIEW_LOOP_NAV_STATE,
      });
    });

    it("keeps my reviews scoped for the whole pass", () => {
      mockRoute.query = { assignedToMe: "1" };
      const { navigateToNextTest } = useTestNavigation(createOptions());

      navigateToNextTest({
        name: "signup-form",
        viewport: "1280x720",
        browser: "firefox",
        environment: "staging",
      });

      expect(mockPush).toHaveBeenCalledWith({
        name: "test-detail",
        params: { projectName: "test-project", testName: "signup-form" },
        query: {
          viewport: "1280x720",
          browser: "firefox",
          environment: "staging",
          assignedToMe: "1",
        },
        state: REVIEW_LOOP_NAV_STATE,
      });
    });
  });

  describe("navigateToInbox (return from an inbox-started pass)", () => {
    it("carries the branch so the inbox does not widen to every branch", () => {
      const { navigateToInbox } = useTestNavigation(
        createOptions({ branchName: ref<string | undefined>("feature/x") }),
      );

      navigateToInbox();

      expect(mockPush).toHaveBeenCalledWith({
        name: "review-inbox",
        query: { branch: "feature/x" },
      });
    });

    it("omits the query when no branch is selected", () => {
      const { navigateToInbox } = useTestNavigation(createOptions());

      navigateToInbox();

      expect(mockPush).toHaveBeenCalledWith({ name: "review-inbox" });
    });

    it("restores the inbox kind/group filters alongside the branch", () => {
      mockRoute.query = { inboxKind: "pdf", inboxGroup: "group-1" };
      const { navigateToInbox } = useTestNavigation(
        createOptions({ branchName: ref<string | undefined>("feature/x") }),
      );

      navigateToInbox();

      expect(mockPush).toHaveBeenCalledWith({
        name: "review-inbox",
        query: {
          branch: "feature/x",
          kind: "pdf",
          group: "group-1",
        },
      });
    });

    it("restores my reviews after a pass that started from it", () => {
      mockRoute.query = { assignedToMe: "1" };
      const { navigateToInbox } = useTestNavigation(createOptions());

      navigateToInbox();

      expect(mockPush).toHaveBeenCalledWith({
        name: "review-inbox",
        query: { assignedToMe: "1" },
      });
    });
  });

  describe("keyOf", () => {
    it("generates key with all fields", () => {
      const key = keyOf({
        name: "login-form",
        viewport: "1920x1080",
        browser: "chrome",
        environment: "prod",
      });

      expect(key).toBe("login-form__1920x1080__chrome__prod");
    });

    it("generates key with only name", () => {
      const key = keyOf({ name: "simple-test" });

      expect(key).toBe("simple-test______");
    });

    it("generates key with partial fields", () => {
      const key = keyOf({
        name: "test",
        browser: "firefox",
      });

      expect(key).toBe("test____firefox__");
    });

    it("handles empty strings as undefined", () => {
      const key = keyOf({
        name: "test",
        viewport: "",
        browser: "",
        environment: "",
      });

      expect(key).toBe("test______");
    });

    it("generates key without name", () => {
      const key = keyOf({
        viewport: "1920x1080",
        browser: "chrome",
      });

      expect(key).toBe("__1920x1080__chrome__");
    });
  });
});
