import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";

const STORAGE_KEY = "theme";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

async function loadUseTheme() {
  const mod = await import("@/composables/useTheme");
  return mod.useTheme;
}

describe("useTheme", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies the stored dark theme on first use", async () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    const useTheme = await loadUseTheme();

    const { theme } = useTheme();

    expect(theme.value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies the stored light theme on first use", async () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const useTheme = await loadUseTheme();

    const { theme } = useTheme();

    expect(theme.value).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("defaults to light when nothing is stored and the system prefers light", async () => {
    const useTheme = await loadUseTheme();

    const { theme } = useTheme();

    expect(theme.value).toBe("light");
  });

  it("defaults to dark when the system prefers dark", async () => {
    mockMatchMedia(true);
    const useTheme = await loadUseTheme();

    const { theme } = useTheme();

    expect(theme.value).toBe("dark");
  });

  it("toggles between light and dark", async () => {
    const useTheme = await loadUseTheme();

    const { theme, toggle } = useTheme();
    expect(theme.value).toBe("light");

    toggle();
    await nextTick();
    expect(theme.value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    toggle();
    await nextTick();
    expect(theme.value).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists the theme to localStorage when it changes", async () => {
    const useTheme = await loadUseTheme();

    const { theme } = useTheme();
    theme.value = "dark";
    await nextTick();

    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("keeps the already-initialized theme across repeated calls", async () => {
    const useTheme = await loadUseTheme();

    const first = useTheme();
    first.toggle();
    expect(first.theme.value).toBe("dark");

    const second = useTheme();
    expect(second.theme.value).toBe("dark");
  });
});
