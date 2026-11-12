import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import ApiKeysView from "@/views/ApiKeysView.vue";
import { TEST_ID } from "@/lib/test-ids";

const {
  mockFindAll,
  mockCreate,
  mockRemove,
  mockRotate,
  mockRevoke,
  mockProjects,
} = vi.hoisted(() => ({
  mockFindAll: vi.fn(),
  mockCreate: vi.fn(),
  mockRemove: vi.fn(),
  mockRotate: vi.fn(),
  mockRevoke: vi.fn(),
  mockProjects: vi.fn(),
}));

vi.mock("@sdk", () => ({
  apiKeysControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  apiKeysControllerCreate: (...args: unknown[]) => mockCreate(...args),
  apiKeysControllerRemove: (...args: unknown[]) => mockRemove(...args),
  apiKeysControllerRotate: (...args: unknown[]) => mockRotate(...args),
  apiKeysControllerRevoke: (...args: unknown[]) => mockRevoke(...args),
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
  mockRotate.mockResolvedValue({
    data: {
      id: "k4",
      name: "nightly",
      rawKey: "rotated-secret-value",
      keyHint: "rote",
      scopes: ["upload"],
      projectNames: [],
      expiresAt: null,
    },
  });
  mockRevoke.mockResolvedValue({
    data: keyDto({
      revokedAt: minutesAgo(1),
      revokedReason: "compromised",
      status: "revoked",
    }),
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

  it("offers rotate only for an active key that was not already replaced", async () => {
    mockFindAll.mockResolvedValue({
      data: [
        keyDto({ id: "k1", name: "active-key" }),
        keyDto({
          id: "k2",
          name: "retiring-key",
          revokedReason: "rotated",
          replacedById: "k1",
        }),
        keyDto({
          id: "k3",
          name: "revoked-key",
          status: "revoked",
          revokedAt: minutesAgo(5),
          revokedReason: "rotated",
          replacedById: null,
        }),
        keyDto({
          id: "k4",
          name: "expired-key",
          status: "expired",
          expiresAt: minutesAgo(5),
        }),
      ],
    });

    const wrapper = mountView();
    await waitForRows(wrapper, 4);

    const rowFor = (text: string) =>
      wrapper
        .findAll(`[data-testid="${TEST_ID.apiKeyRow}"]`)
        .find((row) => row.text().includes(text))!;

    expect(
      rowFor("active-key")
        .find(`[data-testid="${TEST_ID.rotateApiKey}"]`)
        .exists(),
    ).toBe(true);
    expect(
      rowFor("active-key")
        .find(`[data-testid="${TEST_ID.revokeApiKey}"]`)
        .exists(),
    ).toBe(true);

    // A retiring key is already replaced: revoking it early is useful,
    // rotating it again would mint a second successor.
    expect(
      rowFor("retiring-key")
        .find(`[data-testid="${TEST_ID.rotateApiKey}"]`)
        .exists(),
    ).toBe(false);
    expect(
      rowFor("retiring-key")
        .find(`[data-testid="${TEST_ID.revokeApiKey}"]`)
        .exists(),
    ).toBe(true);

    for (const dead of ["revoked-key", "expired-key"]) {
      expect(
        rowFor(dead).find(`[data-testid="${TEST_ID.rotateApiKey}"]`).exists(),
      ).toBe(false);
      expect(
        rowFor(dead).find(`[data-testid="${TEST_ID.revokeApiKey}"]`).exists(),
      ).toBe(false);
      expect(
        rowFor(dead).find(`[data-testid="${TEST_ID.deleteApiKey}"]`).exists(),
      ).toBe(true);
    }
  });

  it("rotates a key with a grace window and reveals the replacement", async () => {
    mockFindAll.mockResolvedValue({
      data: [keyDto({ id: "k1", name: "nightly" })],
    });

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .find(`[data-testid="${TEST_ID.rotateApiKey}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.rotateApiKeyGrace}"]`).exists(),
      ).toBe(true),
    );

    const grace = wrapper.get(`[data-testid="${TEST_ID.rotateApiKeyGrace}"]`);
    expect((grace.element as HTMLInputElement).value).toBe("60");
    await grace.setValue("15");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockRotate).toHaveBeenCalledWith({
        path: { id: "k1" },
        body: { graceMinutes: 15 },
      }),
    );

    // The successor's raw key replaces the create reveal: same dialog, honest
    // title.
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.apiKeyRevealValue}"]`).exists(),
      ).toBe(true),
    );
    expect(wrapper.text()).toContain("New key after rotation");
    expect(
      wrapper.get(`[data-testid="${TEST_ID.apiKeyRevealValue}"]`).text(),
    ).toBe("rotated-secret-value");
  });

  it("refuses a grace window the API would reject", async () => {
    const wrapper = mountView();
    await waitForRows(wrapper, 2);

    await wrapper
      .find(`[data-testid="${TEST_ID.rotateApiKey}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.rotateApiKeyGrace}"]`).exists(),
      ).toBe(true),
    );

    const grace = wrapper.get(`[data-testid="${TEST_ID.rotateApiKeyGrace}"]`);
    const submit = () =>
      wrapper.get(`[data-testid="${TEST_ID.rotateApiKeySubmit}"]`);

    // An empty or fractional value must not silently become 0.
    await grace.setValue("");
    expect(submit().attributes("disabled")).toBeDefined();
    await grace.setValue("0.5");
    expect(submit().attributes("disabled")).toBeDefined();
    await grace.setValue("1441");
    expect(submit().attributes("disabled")).toBeDefined();

    await wrapper.find("form").trigger("submit");
    expect(mockRotate).not.toHaveBeenCalled();

    await grace.setValue("0");
    expect(submit().attributes("disabled")).toBeUndefined();
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockRotate).toHaveBeenCalledWith({
        path: { id: "k1" },
        body: { graceMinutes: 0 },
      }),
    );
  });

  it("revokes a key with a reason and keeps the row for the audit trail", async () => {
    mockFindAll.mockResolvedValue({
      data: [keyDto({ id: "k1", name: "nightly" })],
    });

    const wrapper = mountView();
    await waitForRows(wrapper, 1);

    await wrapper
      .find(`[data-testid="${TEST_ID.revokeApiKey}"]`)
      .trigger("click");
    await vi.waitFor(() =>
      expect(
        wrapper.find(`[data-testid="${TEST_ID.revokeApiKeyReason}"]`).exists(),
      ).toBe(true),
    );

    await wrapper
      .get(`[data-testid="${TEST_ID.revokeApiKeyReason}"]`)
      .setValue("  compromised in CI  ");
    await wrapper.find("form").trigger("submit");

    await vi.waitFor(() =>
      expect(mockRevoke).toHaveBeenCalledWith({
        path: { id: "k1" },
        body: { reason: "compromised in CI" },
      }),
    );
  });
});
