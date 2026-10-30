import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import ApiKeysView from "@/views/ApiKeysView.vue";
import { TEST_ID } from "@/lib/test-ids";

const { mockFindAll, mockCreate, mockRemove, mockProjects } = vi.hoisted(
  () => ({
    mockFindAll: vi.fn(),
    mockCreate: vi.fn(),
    mockRemove: vi.fn(),
    mockProjects: vi.fn(),
  }),
);

vi.mock("@sdk", () => ({
  apiKeysControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  apiKeysControllerCreate: (...args: unknown[]) => mockCreate(...args),
  apiKeysControllerRemove: (...args: unknown[]) => mockRemove(...args),
  projectsControllerGetProjectsWithPendingFlag: (...args: unknown[]) =>
    mockProjects(...args),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

function keyDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    name: "nightly",
    keyHint: "ab12",
    ownerId: "u-1",
    ownerUsername: "alice",
    scopes: ["upload"],
    projectNames: [],
    createdBy: "alice",
    createdAt: minutesAgo(60),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    replacedById: null,
    status: "active",
    ...overrides,
  };
}

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = mount(ApiKeysView, {
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

async function waitForRows(
  wrapper: ReturnType<typeof mountView>,
  count: number,
) {
  await vi.waitFor(() =>
    expect(
      wrapper.findAll(`[data-testid="${TEST_ID.apiKeyRow}"]`),
    ).toHaveLength(count),
  );
}

async function openCreate(wrapper: ReturnType<typeof mountView>) {
  await wrapper.get(`[data-testid="${TEST_ID.newApiKey}"]`).trigger("click");
  await vi.waitFor(() =>
    expect(
      wrapper.find(`[data-testid="${TEST_ID.createApiKeyName}"]`).exists(),
    ).toBe(true),
  );
  await wrapper
    .get(`[data-testid="${TEST_ID.createApiKeyName}"]`)
    .setValue("nightly-ci");
}

function scopeCheckbox(wrapper: ReturnType<typeof mountView>, scope: string) {
  const checkbox = wrapper
    .findAll(`[data-testid="${TEST_ID.apiKeyScope}"]`)
    .find((input) => (input.element as HTMLInputElement).value === scope);
  if (!checkbox) throw new Error(`scope checkbox ${scope} not found`);
  return checkbox;
}

function projectCheckbox(
  wrapper: ReturnType<typeof mountView>,
  projectName: string,
) {
  const checkbox = wrapper
    .findAll(`[data-testid="${TEST_ID.apiKeyProject}"]`)
    .find((input) => (input.element as HTMLInputElement).value === projectName);
  if (!checkbox) throw new Error(`project checkbox ${projectName} not found`);
  return checkbox;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAll.mockResolvedValue({
    data: [
      keyDto(),
      keyDto({
        id: "k2",
        name: "release",
        ownerUsername: null,
        createdBy: "bob",
        scopes: ["admin"],
        projectNames: ["checkout-ui", "admin-ui"],
        lastUsedAt: minutesAgo(2),
      }),
    ],
  });
  mockCreate.mockResolvedValue({
    data: {
      id: "k3",
      name: "nightly-ci",
      rawKey: "vrk_secret",
      keyHint: "vrk_se",
      scopes: ["upload"],
      projectNames: [],
      expiresAt: null,
    },
  });
  mockProjects.mockResolvedValue({
    data: {
      data: [
        { id: "p1", name: "checkout-ui" },
        { id: "p2", name: "admin-ui" },
      ],
    },
  });
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("ApiKeysView", () => {
  it("renders the owner, scope badges and project allowlist", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.apiKeyRow}"]`);

    expect(rows[0]!.get(`[data-testid="${TEST_ID.apiKeyOwner}"]`).text()).toBe(
      "Owner alice",
    );
    expect(
      rows[0]!.get(`[data-testid="${TEST_ID.apiKeyScopes}"]`).text(),
    ).toContain("upload");
    expect(
      rows[0]!.get(`[data-testid="${TEST_ID.apiKeyProjects}"]`).text(),
    ).toBe("All projects");

    // A key without an owner falls back to the legacy creator field.
    expect(rows[1]!.get(`[data-testid="${TEST_ID.apiKeyOwner}"]`).text()).toBe(
      "Owner bob",
    );
    expect(
      rows[1]!.get(`[data-testid="${TEST_ID.apiKeyScopes}"]`).text(),
    ).toContain("admin");
    const projects = rows[1]!.get(`[data-testid="${TEST_ID.apiKeyProjects}"]`);
    expect(projects.text()).toContain("checkout-ui");
    expect(projects.text()).toContain("admin-ui");
  });

  it("creates an upload-only key for all projects by default", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);
    await openCreate(wrapper);

    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        body: {
          name: "nightly-ci",
          scopes: ["upload"],
          projectNames: [],
        },
      }),
    );
  });

  it("caps the key name at 50 characters", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);
    await openCreate(wrapper);

    const input = wrapper.get(`[data-testid="${TEST_ID.createApiKeyName}"]`);
    expect(input.attributes("maxlength")).toBe("50");

    // A pasted or programmatically set value is not cut by the browser, so the
    // dialog itself has to refuse it.
    await input.setValue("a".repeat(51));

    expect(wrapper.text()).toContain("The name can be at most 50 characters.");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.createApiKeySubmit}"]`)
        .attributes("disabled"),
    ).toBeDefined();

    await wrapper.find("form").trigger("submit");
    expect(mockCreate).not.toHaveBeenCalled();

    // 50 characters is still accepted, and the value is sent trimmed.
    await input.setValue(`  ${"a".repeat(50)}  `);
    expect(wrapper.text()).not.toContain(
      "The name can be at most 50 characters.",
    );
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        body: {
          name: "a".repeat(50),
          scopes: ["upload"],
          projectNames: [],
        },
      }),
    );
  });

  it("creates a scoped key restricted to selected projects", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);
    await openCreate(wrapper);

    await scopeCheckbox(wrapper, "read").setValue(true);
    await wrapper
      .get(`[data-testid="${TEST_ID.apiKeyAllProjects}"]`)
      .setValue(false);

    await vi.waitFor(() =>
      expect(
        wrapper.findAll(`[data-testid="${TEST_ID.apiKeyProject}"]`).length,
      ).toBe(2),
    );
    await projectCheckbox(wrapper, "checkout-ui").setValue(true);

    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        body: {
          name: "nightly-ci",
          scopes: ["upload", "read"],
          projectNames: ["checkout-ui"],
        },
      }),
    );
  });

  it("warns about admin scope and requires at least one scope", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);
    await openCreate(wrapper);

    await scopeCheckbox(wrapper, "admin").setValue(true);
    expect(
      wrapper.get(`[data-testid="${TEST_ID.apiKeyAdminWarning}"]`).text(),
    ).toContain("delete projects");

    // Unchecking upload leaves admin only — still one scope, still valid.
    await scopeCheckbox(wrapper, "upload").setValue(false);
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.createApiKeySubmit}"]`)
        .attributes("disabled"),
    ).toBeUndefined();

    // Dropping admin too leaves no scope at all: the form cannot submit.
    await scopeCheckbox(wrapper, "admin").setValue(false);
    expect(wrapper.text()).toContain("Select at least one scope.");
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.createApiKeySubmit}"]`)
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper.find("form").trigger("submit");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("requires a project when the allowlist is restricted", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);
    await openCreate(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.apiKeyAllProjects}"]`)
      .setValue(false);

    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Select at least one project"),
    );
    expect(
      wrapper
        .get(`[data-testid="${TEST_ID.createApiKeySubmit}"]`)
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("falls back to typed project names when no list is available", async () => {
    mockProjects.mockResolvedValue({ data: { data: [] } });

    const wrapper = mountView();
    await waitForRows(wrapper, 2);
    await openCreate(wrapper);

    await wrapper
      .get(`[data-testid="${TEST_ID.apiKeyAllProjects}"]`)
      .setValue(false);

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.apiKeyProjectNames}"]`).exists(),
      ).toBe(true),
    );
    await wrapper
      .get(`[data-testid="${TEST_ID.apiKeyProjectNames}"]`)
      .setValue("checkout-ui, admin-ui");

    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        body: {
          name: "nightly-ci",
          scopes: ["upload"],
          projectNames: ["checkout-ui", "admin-ui"],
        },
      }),
    );
  });

  it("offers delete for a used key and for an unused one", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    const rows = wrapper.findAll(`[data-testid="${TEST_ID.apiKeyRow}"]`);

    expect(
      rows[0]!.find(`[data-testid="${TEST_ID.deleteApiKey}"]`).exists(),
    ).toBe(true);
    expect(
      rows[1]!.find(`[data-testid="${TEST_ID.deleteApiKey}"]`).exists(),
    ).toBe(true);
  });

  it("deletes a key that has already authenticated a request", async () => {
    mockRemove.mockResolvedValue({ data: { success: true } });

    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    // The second row was used by CI minutes ago; deleting it is the hard
    // removal, not a revoke.
    const usedRow = wrapper.findAll(`[data-testid="${TEST_ID.apiKeyRow}"]`)[1]!;
    await usedRow
      .get(`[data-testid="${TEST_ID.deleteApiKey}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.dialogConfirm}"]`).exists(),
      ).toBe(true),
    );
    expect(wrapper.text()).toContain(
      "release is deleted permanently and stops authenticating immediately.",
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.dialogConfirm}"]`)
      .trigger("click");

    await vi.waitFor(() =>
      expect(mockRemove).toHaveBeenCalledWith({ path: { id: "k2" } }),
    );
  });
});
