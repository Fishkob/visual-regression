import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import TestMetadataPanel from "@/components/test-lifecycle/TestMetadataPanel.vue";
import { Select } from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

const {
  mockGet,
  mockUpdate,
  mockReplace,
  mockMine,
  mockProject,
  canWriteRef,
  routeState,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockReplace: vi.fn(),
  mockMine: vi.fn(),
  mockProject: vi.fn(),
  canWriteRef: { value: true },
  routeState: {
    query: { branch: "main", viewport: "1280x720" } as Record<string, string>,
  },
}));

vi.mock("@sdk", () => ({
  testLifecycleControllerGet: (...args: unknown[]) => mockGet(...args),
  testLifecycleControllerUpdate: (...args: unknown[]) => mockUpdate(...args),
  assignmentControllerMine: (...args: unknown[]) => mockMine(...args),
  assignmentControllerComplete: vi.fn(),
  projectsControllerGetOneProject: (...args: unknown[]) => mockProject(...args),
}));

vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: canWriteRef.value }),
  useMeQuery: () => ({
    data: { value: { username: "alice", role: "MEMBER" } },
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({
    name: "test-detail",
    params: { projectName: "checkout", testName: "login" },
    query: routeState.query,
  }),
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

function assignmentDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    projectName: "checkout",
    branchName: "main",
    testName: "login",
    testKind: "image",
    runKey: null,
    assigneeUsername: "alice",
    assignedBy: "bob",
    dueAt: null,
    completedAt: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    isOverdue: false,
    ...overrides,
  };
}

function metadataDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    name: "login",
    description: "Login flow",
    tags: ["smoke", "auth"],
    mutedUntil: null,
    muteReason: null,
    isMuted: false,
    sizePolicy: "FAIL",
    flake: { transitions: 3, changed: 2, clean: 1 },
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(TestMetadataPanel, {
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

async function waitForPanel(wrapper: ReturnType<typeof mountPanel>) {
  await vi.waitFor(() =>
    expect(
      wrapper.find(`[data-testid="${TEST_ID.testFlakeBadge}"]`).exists(),
    ).toBe(true),
  );
}

async function openEditor(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper
    .get(`[data-testid="${TEST_ID.testEditAction}"]`)
    .trigger("click");
  await vi.waitFor(() =>
    expect(
      wrapper.find(`[data-testid="${TEST_ID.testEditDialog}"]`).exists(),
    ).toBe(true),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canWriteRef.value = true;
  routeState.query = { branch: "main", viewport: "1280x720" };
  mockGet.mockResolvedValue({ data: metadataDto() });
  mockMine.mockResolvedValue({ data: [] });
  mockProject.mockResolvedValue({
    data: {
      id: "p-1",
      name: "checkout",
      branchName: "main",
      defaultBranchName: "main",
    },
  });
  mockUpdate.mockImplementation(({ body }: { body: Record<string, unknown> }) =>
    Promise.resolve({
      data: metadataDto({
        ...("name" in body ? { name: body.name } : {}),
        tags: body.tags ?? ["smoke", "auth"],
        description: "description" in body ? body.description : "Login flow",
      }),
    }),
  );
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("TestMetadataPanel", () => {
  it("shows tags, description and the flake badge", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    expect(
      wrapper.get(`[data-testid="${TEST_ID.testFlakeBadge}"]`).text(),
    ).toBe("3 transitions in 30 days");
    expect(wrapper.get(`[data-testid="${TEST_ID.testTags}"]`).text()).toContain(
      "smoke",
    );
    expect(wrapper.get(`[data-testid="${TEST_ID.testTags}"]`).text()).toContain(
      "auth",
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.testDescription}"]`).text(),
    ).toBe("Login flow");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.testMutedBadge}"]`).exists(),
    ).toBe(false);
  });

  it("shows the muted badge with the reason as its title", async () => {
    mockGet.mockResolvedValue({
      data: metadataDto({
        isMuted: true,
        mutedUntil: "2026-11-01T10:00:00.000Z",
        muteReason: "flaky fixture",
      }),
    });

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    const badge = wrapper.get(`[data-testid="${TEST_ID.testMutedBadge}"]`);
    expect(badge.text()).toContain("Muted until");
    expect(badge.attributes("title")).toBe("flaky fixture");
  });

  it("saves a rename and navigates to the new test route", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openEditor(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.testEditName}"]`)
      .setValue("checkout-v2");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "main" },
        body: {
          name: "checkout-v2",
          description: "Login flow",
          tags: ["smoke", "auth"],
          sizePolicy: "FAIL",
        },
      }),
    );
    await vi.waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        name: "test-detail",
        params: { projectName: "checkout", testName: "checkout-v2" },
        query: { branch: "main", viewport: "1280x720" },
      }),
    );
  });

  it("saves edited tags and description without navigating", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openEditor(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.testEditTags}"]`)
      .setValue("Smoke, Critical");
    await wrapper
      .get(`[data-testid="${TEST_ID.testEditDescription}"]`)
      .setValue("Updated description");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "main" },
        body: {
          name: "login",
          description: "Updated description",
          tags: ["smoke", "critical"],
          sizePolicy: "FAIL",
        },
      }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends an ISO mute timestamp with its reason", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openEditor(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.testMuteUntil}"]`)
      .setValue("2026-11-01T10:00");
    await wrapper
      .get(`[data-testid="${TEST_ID.testMuteReason}"]`)
      .setValue("flaky fixture");
    await wrapper.find("form").trigger("submit");

    const expectedIso = new Date("2026-11-01T10:00").toISOString();
    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "main" },
        body: {
          name: "login",
          description: "Login flow",
          tags: ["smoke", "auth"],
          sizePolicy: "FAIL",
          mutedUntil: expectedIso,
          muteReason: "flaky fixture",
        },
      }),
    );
  });

  it("saves the selected size policy", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openEditor(wrapper);

    const policySelect = wrapper
      .findAllComponents(Select)
      .find((component) =>
        component
          .find(`[data-testid="${TEST_ID.testSizePolicySelect}"]`)
          .exists(),
      );
    if (!policySelect) throw new Error("size policy select not found");
    policySelect.vm.$emit("update:modelValue", "RESIZE");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "main" },
        body: {
          name: "login",
          description: "Login flow",
          tags: ["smoke", "auth"],
          sizePolicy: "RESIZE",
        },
      }),
    );
  });

  it("requires a reason when scheduling a mute", async () => {
    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openEditor(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.testMuteUntil}"]`)
      .setValue("2026-11-01T10:00");

    expect(wrapper.text()).toContain("A mute reason is required");
    await wrapper.find("form").trigger("submit");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("unmutes the test with a null mutedUntil", async () => {
    mockGet.mockResolvedValue({
      data: metadataDto({
        isMuted: true,
        mutedUntil: "2026-11-01T10:00:00.000Z",
        muteReason: "flaky fixture",
      }),
    });

    const wrapper = mountPanel();
    await waitForPanel(wrapper);
    await openEditor(wrapper);

    await wrapper.get(`[data-testid="${TEST_ID.testUnmute}"]`).trigger("click");

    await vi.waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        path: { projectName: "checkout", testName: "login" },
        query: { branch: "main" },
        body: { mutedUntil: null, muteReason: null },
      }),
    );
  });

  it("hides the edit action from a read-only viewer", async () => {
    canWriteRef.value = false;

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    expect(
      wrapper.find(`[data-testid="${TEST_ID.testEditAction}"]`).exists(),
    ).toBe(false);
    // The metadata itself stays visible.
    expect(
      wrapper.find(`[data-testid="${TEST_ID.testFlakeBadge}"]`).exists(),
    ).toBe(true);
  });
});

describe("TestMetadataPanel assignment badge", () => {
  it("matches a default-branch assignment on an unscoped route", async () => {
    // The assignment stores the resolved branch ("main"); the detail route for
    // the project default carries no ?branch, so the default name from the
    // project read is what makes the two comparable.
    routeState.query = { viewport: "1280x720" };
    mockMine.mockResolvedValue({ data: [assignmentDto()] });

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.assignBadge}"]`).exists(),
      ).toBe(true),
    );
    expect(
      wrapper.get(`[data-testid="${TEST_ID.assignBadge}"]`).text(),
    ).toContain("alice");
    expect(
      wrapper.find(`[data-testid="${TEST_ID.assignComplete}"]`).exists(),
    ).toBe(true);
    // The default branch name comes from the project read of the same branch
    // scope (an unscoped route means the project default).
    expect(mockProject).toHaveBeenCalledWith({
      path: { projectName: "checkout" },
      query: { skip: 0, take: 50 },
    });
  });

  it("keeps a default-branch assignment off a feature-branch route", async () => {
    routeState.query = { branch: "feature/x", viewport: "1280x720" };
    mockMine.mockResolvedValue({ data: [assignmentDto()] });

    const wrapper = mountPanel();
    await waitForPanel(wrapper);

    // Let the project read settle before asserting the absence.
    await vi.waitFor(() => expect(mockProject).toHaveBeenCalled());
    expect(
      wrapper.find(`[data-testid="${TEST_ID.assignBadge}"]`).exists(),
    ).toBe(false);
  });
});
