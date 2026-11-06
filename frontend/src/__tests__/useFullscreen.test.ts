import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const requestFullscreen = vi.fn<() => Promise<void>>();
const exitFullscreen = vi.fn<() => Promise<void>>();

async function loadUseFullscreen() {
  const mod = await import("@/composables/useFullscreen");
  return mod.useFullscreen;
}

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => element,
  });
}

function pressEscape() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
  );
}

describe("useFullscreen", () => {
  beforeEach(() => {
    vi.resetModules();
    requestFullscreen.mockReset();
    requestFullscreen.mockResolvedValue(undefined);
    exitFullscreen.mockReset();
    exitFullscreen.mockResolvedValue(undefined);
    setFullscreenElement(null);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    document
      .querySelectorAll('[role="dialog"], [role="alertdialog"]')
      .forEach((element) => element.remove());
  });

  afterEach(() => {
    document
      .querySelectorAll('[role="dialog"], [role="alertdialog"]')
      .forEach((element) => element.remove());
  });

  it("starts inactive", async () => {
    const useFullscreen = await loadUseFullscreen();

    expect(useFullscreen().isFullscreen.value).toBe(false);
  });

  it("gives the page the window and asks the document for fullscreen", async () => {
    const useFullscreen = await loadUseFullscreen();
    const { isFullscreen, toggleFullscreen } = useFullscreen();

    await toggleFullscreen();

    expect(isFullscreen.value).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("leaves fullscreen through the same toggle and exits the document once", async () => {
    const useFullscreen = await loadUseFullscreen();
    const { isFullscreen, toggleFullscreen } = useFullscreen();
    await toggleFullscreen();
    setFullscreenElement(document.documentElement);

    await toggleFullscreen();

    expect(isFullscreen.value).toBe(false);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("keeps the layout when the document refuses the fullscreen request", async () => {
    requestFullscreen.mockRejectedValueOnce(new Error("denied"));
    const useFullscreen = await loadUseFullscreen();
    const { isFullscreen, enterFullscreen } = useFullscreen();

    await enterFullscreen();

    // A refused request must not take the room back: the immersive layout is the
    // part every browser can do.
    expect(isFullscreen.value).toBe(true);
  });

  it("leaves the mode on Escape", async () => {
    const useFullscreen = await loadUseFullscreen();
    const { isFullscreen, enterFullscreen } = useFullscreen();
    await enterFullscreen();

    pressEscape();

    expect(isFullscreen.value).toBe(false);
  });

  it("leaves the mode when the browser ends fullscreen itself", async () => {
    const useFullscreen = await loadUseFullscreen();
    const { isFullscreen, enterFullscreen } = useFullscreen();
    await enterFullscreen();

    setFullscreenElement(null);
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(isFullscreen.value).toBe(false);
  });

  it("lets an open dialog own Escape", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    const useFullscreen = await loadUseFullscreen();
    const { isFullscreen, enterFullscreen } = useFullscreen();
    await enterFullscreen();

    pressEscape();

    expect(isFullscreen.value).toBe(true);
  });

  it("shares one state across callers, so the shell can follow a page", async () => {
    const useFullscreen = await loadUseFullscreen();
    const page = useFullscreen();
    const shell = useFullscreen();

    await page.toggleFullscreen();

    expect(shell.isFullscreen.value).toBe(true);
    expect(shell.isFullscreen).toBe(page.isFullscreen);
  });
});
