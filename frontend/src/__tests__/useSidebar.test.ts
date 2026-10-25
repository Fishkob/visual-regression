import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";

const STORAGE_KEY = "sidebar-collapsed";

async function loadUseSidebar() {
  const mod = await import("@/composables/useSidebar");
  return mod.useSidebar;
}

describe("useSidebar", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts expanded when nothing is stored", async () => {
    const useSidebar = await loadUseSidebar();

    const { collapsed } = useSidebar();

    expect(collapsed.value).toBe(false);
  });

  it("restores the collapsed state from storage on a fresh module import", async () => {
    localStorage.setItem(STORAGE_KEY, "true");

    const useSidebar = await loadUseSidebar();

    expect(useSidebar().collapsed.value).toBe(true);
  });

  it("toggles the collapsed state and persists it", async () => {
    const useSidebar = await loadUseSidebar();

    const { collapsed, toggle } = useSidebar();
    expect(collapsed.value).toBe(false);

    toggle();
    await nextTick();
    expect(collapsed.value).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");

    toggle();
    await nextTick();
    expect(collapsed.value).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("keeps the persisted state across a fresh module import", async () => {
    const useSidebar = await loadUseSidebar();
    useSidebar().toggle();
    await nextTick();

    vi.resetModules();
    const reloaded = await loadUseSidebar();

    expect(reloaded().collapsed.value).toBe(true);
  });

  it("shares one module-level state and hydrates it only once", async () => {
    const useSidebar = await loadUseSidebar();

    const first = useSidebar();
    expect(first.collapsed.value).toBe(false);

    // Hydration happened on the first call, so a later storage write must not
    // reach the already-initialized module-level ref.
    localStorage.setItem(STORAGE_KEY, "true");
    const second = useSidebar();

    expect(second.collapsed).toBe(first.collapsed);
    expect(second.collapsed.value).toBe(false);
  });
});
