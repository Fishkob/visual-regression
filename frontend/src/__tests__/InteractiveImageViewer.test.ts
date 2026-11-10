import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import InteractiveImageViewer from "@/components/detail-panels/InteractiveImageViewer.vue";
import { TEST_ID } from "@/lib/test-ids";

const defaultProps = {
  baselineUrl: "/images/baseline.png",
  candidateUrl: "/images/candidate.png",
  diffUrl: "/images/diff.png",
};

const mounted: { unmount: () => void }[] = [];

type ChangedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount: number;
};

type ViewerProps = {
  baselineUrl?: string;
  candidateUrl?: string;
  diffUrl?: string;
  regions?: ChangedRegion[];
};

const REGIONS: ChangedRegion[] = [
  { x: 10, y: 20, width: 100, height: 50, pixelCount: 500 },
  { x: 300, y: 400, width: 20, height: 20, pixelCount: 40 },
];

async function loadCandidate(
  wrapper: ReturnType<typeof mountViewer>,
  width = 800,
  height = 600,
) {
  return loadPanelImage(wrapper, TEST_ID.panelHighlight, width, height);
}

async function loadPanelImage(
  wrapper: ReturnType<typeof mountViewer>,
  panelId: string,
  width: number,
  height: number,
) {
  const image = byId(wrapper, panelId).find("img");
  Object.defineProperty(image.element, "naturalWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(image.element, "naturalHeight", {
    value: height,
    configurable: true,
  });
  await image.trigger("load");
  return image;
}

function mountViewer(props: ViewerProps = defaultProps) {
  const wrapper = mount(InteractiveImageViewer, { props });
  mounted.push(wrapper);
  return wrapper;
}

const stageOf = (wrapper: ReturnType<typeof mountViewer>, panelId: string) =>
  wrapper.find(`[data-testid="${panelId}-zoom"] > div`);

const byId = (wrapper: ReturnType<typeof mountViewer>, id: string) =>
  wrapper.find(`[data-testid="${id}"]`);

const pressKey = async (
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
  await nextTick();
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => {
    wrapper.unmount();
  });
  window.localStorage.clear();
});

describe("InteractiveImageViewer", () => {
  it("renders baseline, candidate and diff panels", () => {
    const wrapper = mountViewer();
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelCandidate).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(true);
  });

  it("defaults to Side by Side mode", () => {
    const wrapper = mountViewer();
    const candidatePanel = byId(wrapper, TEST_ID.panelCandidate);
    expect(candidatePanel.find("img").attributes("src")).toBe(
      "/images/candidate.png",
    );
    expect(candidatePanel.text()).toContain("Candidate");
    const diffPanel = byId(wrapper, TEST_ID.panelDiff);
    expect(diffPanel.find("img").attributes("src")).toBe("/images/diff.png");
    expect(diffPanel.text()).toContain("Diff");
  });

  it("shows only the diff panel in Diff Only mode", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.modeDiff).trigger("click");
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(false);
    expect(byId(wrapper, TEST_ID.panelCandidate).exists()).toBe(false);
    const diffPanel = byId(wrapper, TEST_ID.panelDiff);
    expect(diffPanel.exists()).toBe(true);
    expect(diffPanel.find("img").attributes("src")).toBe("/images/diff.png");
    expect(diffPanel.text()).toContain("Diff");
  });

  it("returns to Side by Side mode", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.modeDiff).trigger("click");
    await byId(wrapper, TEST_ID.modeSidebyside).trigger("click");
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelCandidate).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(true);
  });

  // The comparison surface is framed by the picture, not by the page: otherwise
  // the leftover canvas shows up as a band beside the picture in every layered
  // mode. The width and the height limit cannot both come from CSS, so the stage
  // carries the measured box instead.
  describe("picture frame", () => {
    const viewportHeight = window.innerHeight;

    afterEach(() => {
      Object.defineProperty(window, "innerHeight", {
        value: viewportHeight,
        configurable: true,
      });
    });

    async function sizeSurface(
      wrapper: ReturnType<typeof mountViewer>,
      width: number,
      height: number,
    ) {
      Object.defineProperty(wrapper.element, "clientWidth", {
        value: width,
        configurable: true,
      });
      Object.defineProperty(window, "innerHeight", {
        value: height,
        configurable: true,
      });
      window.dispatchEvent(new Event("resize"));
      await nextTick();
    }

    function boxOf(
      wrapper: ReturnType<typeof mountViewer>,
      panelId: string,
    ): { width: number; height: number } {
      const style = stageOf(wrapper, panelId).attributes("style") ?? "";
      return {
        width: Number(/width:\s*(\d+)px/.exec(style)?.[1]),
        height: Number(/height:\s*(\d+)px/.exec(style)?.[1]),
      };
    }

    it("frames the overlapping modes with the picture", async () => {
      const wrapper = mountViewer();
      await byId(wrapper, TEST_ID.modeOverlay).trigger("click");
      await loadPanelImage(wrapper, TEST_ID.panelOverlay, 1200, 600);

      const overlay = byId(wrapper, TEST_ID.panelOverlay);
      expect(overlay.classes()).toContain("w-fit");
      expect(overlay.classes()).toContain("mx-auto");

      await byId(wrapper, TEST_ID.modeWipe).trigger("click");
      expect(byId(wrapper, TEST_ID.panelWipe).classes()).toContain("w-fit");
    });

    it("frames the blink stage with the picture", async () => {
      const wrapper = mountViewer();
      await byId(wrapper, TEST_ID.modeBlink).trigger("click");
      await loadPanelImage(wrapper, TEST_ID.panelHighlight, 1200, 600);

      expect(byId(wrapper, TEST_ID.panelHighlight).classes()).toContain(
        "w-fit",
      );
    });

    it("keeps the page width until the picture has reported its size", async () => {
      const wrapper = mountViewer();
      await byId(wrapper, TEST_ID.modeOverlay).trigger("click");

      const card = byId(wrapper, TEST_ID.panelOverlay);
      expect(card.classes()).not.toContain("w-fit");
      expect(stageOf(wrapper, TEST_ID.panelOverlay).classes()).toContain(
        "w-full",
      );
    });

    it("centres the single diff on the picture", async () => {
      const wrapper = mountViewer();
      await byId(wrapper, TEST_ID.modeDiff).trigger("click");

      expect(byId(wrapper, TEST_ID.panelDiff).classes()).toContain("w-fit");
      expect(wrapper.find(".grid").classes()).not.toContain("max-w-5xl");
    });

    it("gives the stage the largest box that fits the surface", async () => {
      const wrapper = mountViewer();
      await byId(wrapper, TEST_ID.modeOverlay).trigger("click");
      await loadPanelImage(wrapper, TEST_ID.panelOverlay, 1200, 600);

      // Width-bound: the surface leaves 800px of room for the picture.
      await sizeSurface(wrapper, 834, 2000);
      expect(boxOf(wrapper, TEST_ID.panelOverlay)).toEqual({
        width: 800,
        height: 400,
      });

      // Height-bound: 70% of the viewport, the width follows the ratio.
      await sizeSurface(wrapper, 2000, 1000);
      expect(boxOf(wrapper, TEST_ID.panelOverlay)).toEqual({
        width: 1400,
        height: 700,
      });
    });

    it("keeps a portrait picture inside the surface", async () => {
      const wrapper = mountViewer();
      await byId(wrapper, TEST_ID.modeOverlay).trigger("click");
      await loadPanelImage(wrapper, TEST_ID.panelOverlay, 400, 900);

      await sizeSurface(wrapper, 834, 2000);
      expect(boxOf(wrapper, TEST_ID.panelOverlay)).toEqual({
        width: 622,
        height: 1400,
      });
    });

    it("drops the box at 1:1 so the picture keeps its pixels", async () => {
      const wrapper = mountViewer();
      await byId(wrapper, TEST_ID.modeOverlay).trigger("click");
      await loadPanelImage(wrapper, TEST_ID.panelOverlay, 1200, 600);
      await sizeSurface(wrapper, 834, 2000);

      await byId(wrapper, TEST_ID.actualSizeToggle).trigger("click");

      expect(boxOf(wrapper, TEST_ID.panelOverlay)).toEqual({
        width: NaN,
        height: NaN,
      });
    });
  });

  it("shows all four view modes when a diff exists", () => {
    const wrapper = mountViewer();
    for (const id of [
      TEST_ID.modeSidebyside,
      TEST_ID.modeDiff,
      TEST_ID.modeOverlay,
      TEST_ID.modeWipe,
    ]) {
      expect(byId(wrapper, id).exists()).toBe(true);
    }
  });

  it("switches to Overlay mode with an opacity slider", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.modeOverlay).trigger("click");

    expect(byId(wrapper, TEST_ID.panelOverlay).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(false);

    const opacity = byId(wrapper, TEST_ID.overlayOpacity);
    expect(opacity.exists()).toBe(true);
    expect(opacity.element.closest("label")?.textContent).toContain(
      "Candidate opacity",
    );

    await opacity.setValue("25");
    const candidate = byId(wrapper, TEST_ID.panelOverlay).find(
      'img[alt="Candidate"]',
    );
    expect(candidate.attributes("style")).toContain("opacity: 0.25");
  });

  it("switches to Wipe mode with a keyboard accessible handle", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.modeWipe).trigger("click");

    expect(byId(wrapper, TEST_ID.panelWipe).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(false);

    const handle = byId(wrapper, TEST_ID.wipeHandle);
    expect(handle.exists()).toBe(true);
    expect(handle.attributes("role")).toBe("slider");
    expect(handle.attributes("tabindex")).toBe("0");
    expect(handle.attributes("aria-label")).toBeTruthy();
    expect(handle.attributes("aria-valuenow")).toBe("50");

    await pressKey(handle.element, "ArrowRight");
    expect(byId(wrapper, TEST_ID.wipeHandle).attributes("aria-valuenow")).toBe(
      "52",
    );

    await pressKey(handle.element, "ArrowLeft");
    expect(byId(wrapper, TEST_ID.wipeHandle).attributes("aria-valuenow")).toBe(
      "50",
    );

    await pressKey(handle.element, "ArrowLeft");
    expect(byId(wrapper, TEST_ID.wipeHandle).attributes("aria-valuenow")).toBe(
      "48",
    );
  });

  it("keeps the wipe handle independent from pan", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.modeWipe).trigger("click");
    await pressKey(byId(wrapper, TEST_ID.wipeHandle).element, "ArrowLeft");

    expect(stageOf(wrapper, TEST_ID.panelWipe).attributes("style")).toContain(
      "translate(0px, 0px)",
    );
    expect(byId(wrapper, TEST_ID.wipeHandle).attributes("aria-valuenow")).toBe(
      "48",
    );
  });

  it("shows zoom controls", () => {
    const wrapper = mountViewer();
    expect(byId(wrapper, TEST_ID.zoomIn).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.zoomOut).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.zoomReset).exists()).toBe(true);
  });

  it("zooms in on click", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("150%");
  });

  it("zooms out on click", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await byId(wrapper, TEST_ID.zoomOut).trigger("click");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
  });

  it("resets zoom on reset click", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await byId(wrapper, TEST_ID.zoomReset).trigger("click");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
  });

  it("returns to fit to screen when zooming back to 100%", async () => {
    const wrapper = mountViewer();
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "true",
    );

    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "false",
    );

    await byId(wrapper, TEST_ID.zoomOut).trigger("click");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "true",
    );
    expect(
      byId(wrapper, TEST_ID.actualSizeToggle).attributes("aria-pressed"),
    ).toBe("false");
  });

  it("returns to fit to screen on reset after panning a zoom", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await pressKey(window, "ArrowRight");
    expect(
      stageOf(wrapper, TEST_ID.panelBaseline).attributes("style"),
    ).toContain("translate(40px, 0px)");

    await byId(wrapper, TEST_ID.zoomReset).trigger("click");

    expect(
      stageOf(wrapper, TEST_ID.panelBaseline).attributes("style"),
    ).toContain("translate(0px, 0px)");
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "true",
    );
  });

  it("keeps actual size as the resting mode after choosing 1:1", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.actualSizeToggle).trigger("click");

    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await byId(wrapper, TEST_ID.zoomOut).trigger("click");

    expect(
      byId(wrapper, TEST_ID.actualSizeToggle).attributes("aria-pressed"),
    ).toBe("true");
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "false",
    );
  });

  it("returns to the resting state after a wheel zoom round trip", async () => {
    const wrapper = mountViewer();
    const stage = byId(wrapper, `${TEST_ID.panelBaseline}-zoom`);
    const wheel = async (deltaY: number) => {
      stage.element.dispatchEvent(
        new WheelEvent("wheel", {
          ctrlKey: true,
          deltaY,
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();
    };

    await wheel(-100);
    await pressKey(window, "ArrowDown");
    await wheel(100);

    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "true",
    );
    expect(
      stageOf(wrapper, TEST_ID.panelBaseline).attributes("style"),
    ).toContain("translate(0px, 0px)");
  });

  it("disables zoom out at minimum zoom (50%)", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.zoomOut).trigger("click");
    await byId(wrapper, TEST_ID.zoomOut).trigger("click");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("50%");
    expect(byId(wrapper, TEST_ID.zoomOut).attributes("disabled")).toBe("");
  });

  it("disables zoom in at maximum zoom (200%)", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("200%");
    expect(byId(wrapper, TEST_ID.zoomIn).attributes("disabled")).toBe("");
  });

  it("fits to screen by default and toggles actual size", async () => {
    const wrapper = mountViewer();
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "true",
    );

    await byId(wrapper, TEST_ID.actualSizeToggle).trigger("click");
    expect(
      byId(wrapper, TEST_ID.actualSizeToggle).attributes("aria-pressed"),
    ).toBe("true");
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "false",
    );

    await byId(wrapper, TEST_ID.fitToggle).trigger("click");
    expect(byId(wrapper, TEST_ID.fitToggle).attributes("aria-pressed")).toBe(
      "true",
    );
    expect(
      byId(wrapper, TEST_ID.actualSizeToggle).attributes("aria-pressed"),
    ).toBe("false");
  });

  it("returns to 100% when choosing actual size", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await byId(wrapper, TEST_ID.actualSizeToggle).trigger("click");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
    expect(
      byId(wrapper, TEST_ID.actualSizeToggle).attributes("aria-pressed"),
    ).toBe("true");
  });

  it("keeps the zoomed content inside an overflowing scroll container", async () => {
    const wrapper = mountViewer();

    await byId(wrapper, TEST_ID.zoomIn).trigger("click");

    const scrollContainer = byId(wrapper, `${TEST_ID.panelBaseline}-zoom`);
    expect(scrollContainer.classes()).toContain("overflow-auto");
    expect(scrollContainer.classes()).toContain("max-h-[70vh]");
    expect(scrollContainer.find('[style*="scale(1.5)"]').exists()).toBe(true);
  });

  it("opens a fullscreen overlay and closes it with Escape", async () => {
    const wrapper = mountViewer();
    expect(byId(wrapper, TEST_ID.fullscreenClose).exists()).toBe(false);

    await byId(wrapper, TEST_ID.fullscreenToggle).trigger("click");
    expect(
      byId(wrapper, TEST_ID.fullscreenToggle).attributes("aria-pressed"),
    ).toBe("true");
    expect(byId(wrapper, TEST_ID.fullscreenClose).exists()).toBe(true);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    await pressKey(window, "Escape");

    expect(byId(wrapper, TEST_ID.fullscreenClose).exists()).toBe(false);
    expect(
      byId(wrapper, TEST_ID.fullscreenToggle).attributes("aria-pressed"),
    ).toBe("false");
  });

  it("closes the fullscreen overlay with its close button", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.fullscreenToggle).trigger("click");
    await byId(wrapper, TEST_ID.fullscreenClose).trigger("click");
    expect(byId(wrapper, TEST_ID.fullscreenClose).exists()).toBe(false);
  });

  it("trades the third column for size in fullscreen", async () => {
    const wrapper = mountViewer();
    const grid = () =>
      byId(wrapper, TEST_ID.panelBaseline).element.parentElement as HTMLElement;

    expect(grid().classList.contains("grid-cols-3")).toBe(true);

    await byId(wrapper, TEST_ID.fullscreenToggle).trigger("click");

    expect(grid().classList.contains("grid-cols-2")).toBe(true);
    expect(grid().classList.contains("grid-cols-3")).toBe(false);
  });

  it("hides a pane and gives its room to the others", async () => {
    const wrapper = mountViewer();
    const grid = () =>
      byId(wrapper, TEST_ID.panelBaseline).element.parentElement as HTMLElement;

    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(true);
    expect(
      byId(wrapper, TEST_ID.paneToggleDiff).attributes("aria-pressed"),
    ).toBe("true");

    await byId(wrapper, TEST_ID.paneToggleDiff).trigger("click");

    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(false);
    expect(
      byId(wrapper, TEST_ID.paneToggleDiff).attributes("aria-pressed"),
    ).toBe("false");
    expect(grid().classList.contains("grid-cols-2")).toBe(true);

    await byId(wrapper, TEST_ID.paneToggleDiff).trigger("click");

    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(true);
    expect(grid().classList.contains("grid-cols-3")).toBe(true);
  });

  it("keeps the last visible pane", async () => {
    const wrapper = mountViewer();

    await byId(wrapper, TEST_ID.paneToggleCandidate).trigger("click");
    await byId(wrapper, TEST_ID.paneToggleDiff).trigger("click");

    expect(
      byId(wrapper, TEST_ID.paneToggleBaseline).attributes("disabled"),
    ).toBeDefined();
    await byId(wrapper, TEST_ID.paneToggleBaseline).trigger("click");

    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(true);
    const grid = byId(wrapper, TEST_ID.panelBaseline).element
      .parentElement as HTMLElement;
    expect(grid.classList.contains("grid-cols-1")).toBe(true);
  });

  it("ignores a hidden pane in the single-picture modes", async () => {
    const wrapper = mountViewer();

    await byId(wrapper, TEST_ID.paneToggleDiff).trigger("click");
    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(false);

    await byId(wrapper, TEST_ID.modeDiff).trigger("click");

    expect(byId(wrapper, TEST_ID.paneToggleDiff).exists()).toBe(false);
    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(true);
  });

  it("shows the minimap only while the stage shows a crop", async () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });
    await loadCandidate(wrapper);

    const stage = byId(wrapper, `${TEST_ID.panelHighlight}-zoom`)
      .element as HTMLElement;
    const image = stage.querySelector("img") as HTMLImageElement;
    Object.defineProperty(stage, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 600, height: 400 }),
      configurable: true,
    });
    Object.defineProperty(image, "getBoundingClientRect", {
      value: () => ({ left: -300, top: -200, width: 1200, height: 750 }),
      configurable: true,
    });

    expect(byId(wrapper, TEST_ID.minimap).exists()).toBe(false);

    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(byId(wrapper, TEST_ID.minimap).exists()).toBe(true);
  });

  it("alternates baseline and candidate in blink mode", async () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });

    await pressKey(window, "6");

    const panel = byId(wrapper, TEST_ID.panelHighlight);
    const images = panel.findAll("img");
    expect(images).toHaveLength(2);
    expect(images[1].classes()).toContain("blink-candidate");
  });

  it("stays on the whole page after the image loads", async () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });

    await loadCandidate(wrapper);

    expect(byId(wrapper, TEST_ID.changedRegionFocus).exists()).toBe(false);
  });

  it("opens on the marked diff when the comparison knows its regions", () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });

    expect(byId(wrapper, TEST_ID.panelHighlight).exists()).toBe(true);
    expect(
      byId(wrapper, TEST_ID.modeHighlight).attributes("aria-pressed"),
    ).toBe("true");
  });

  it("numbers the changed regions on the image", async () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });

    await loadCandidate(wrapper);

    const boxes = wrapper.findAll(
      `[data-testid="${TEST_ID.changedRegionBox}"]`,
    );
    expect(boxes).toHaveLength(2);
    expect(boxes[0].text()).toBe("1");
    expect(boxes[0].attributes("style")).toContain("width: 12.5%");
  });

  it("draws no boxes without a loaded image size", () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });

    expect(
      wrapper.find(`[data-testid="${TEST_ID.changedRegionBox}"]`).exists(),
    ).toBe(false);
  });

  it("steps through the regions with n and p", async () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });
    await loadCandidate(wrapper);

    await pressKey(window, "n");
    expect(byId(wrapper, TEST_ID.changedRegionFocus).text()).toBe(
      "Area 1 of 2",
    );

    await pressKey(window, "n");
    expect(byId(wrapper, TEST_ID.changedRegionFocus).text()).toBe(
      "Area 2 of 2",
    );

    await pressKey(window, "p");
    expect(byId(wrapper, TEST_ID.changedRegionFocus).text()).toBe(
      "Area 1 of 2",
    );
  });

  it("focuses a region through the exposed api", async () => {
    const wrapper = mountViewer({ ...defaultProps, regions: REGIONS });
    await loadCandidate(wrapper);

    (
      wrapper.vm as unknown as { focusRegion: (index: number) => void }
    ).focusRegion(1);
    await nextTick();

    expect(byId(wrapper, TEST_ID.changedRegionFocus).text()).toBe(
      "Area 2 of 2",
    );
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).not.toBe("100%");
  });

  it("switches modes and zooms with keyboard shortcuts", async () => {
    const wrapper = mountViewer();

    await pressKey(window, "1");
    expect(byId(wrapper, TEST_ID.panelHighlight).exists()).toBe(true);

    await pressKey(window, "4");
    expect(byId(wrapper, TEST_ID.panelOverlay).exists()).toBe(true);

    await pressKey(window, "5");
    expect(byId(wrapper, TEST_ID.panelWipe).exists()).toBe(true);

    await pressKey(window, "6");
    expect(byId(wrapper, TEST_ID.panelHighlight).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.modeBlink).attributes("aria-pressed")).toBe(
      "true",
    );

    await pressKey(window, "3");
    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(false);

    await pressKey(window, "2");
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(true);

    await pressKey(window, "+");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("150%");

    await pressKey(window, "-");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");

    await pressKey(window, "-");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("75%");

    await pressKey(window, "0");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
  });

  it("ignores shortcuts while an input is focused", async () => {
    const wrapper = mountViewer();
    await byId(wrapper, TEST_ID.modeOverlay).trigger("click");
    const opacity = byId(wrapper, TEST_ID.overlayOpacity).element;

    await pressKey(opacity, "4");
    await pressKey(opacity, "+");

    expect(byId(wrapper, TEST_ID.panelOverlay).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
  });

  it("pans both side-by-side panels with arrow keys", async () => {
    const wrapper = mountViewer();

    await pressKey(window, "ArrowRight");

    const baseline = stageOf(wrapper, TEST_ID.panelBaseline);
    const candidate = stageOf(wrapper, TEST_ID.panelCandidate);
    expect(baseline.attributes("style")).toContain("translate(40px, 0px)");
    expect(candidate.attributes("style")).toBe(baseline.attributes("style"));
  });

  it("pans by dragging the image", async () => {
    const wrapper = mountViewer();
    const target = stageOf(wrapper, TEST_ID.panelBaseline).element;

    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 100,
      }),
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 130, clientY: 120 }),
    );
    await nextTick();

    expect(
      stageOf(wrapper, TEST_ID.panelBaseline).attributes("style"),
    ).toContain("translate(30px, 20px)");

    window.dispatchEvent(new MouseEvent("mouseup"));
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 200, clientY: 200 }),
    );
    await nextTick();
    expect(
      stageOf(wrapper, TEST_ID.panelBaseline).attributes("style"),
    ).toContain("translate(30px, 20px)");
  });

  it("restores the last view mode and zoom from localStorage", () => {
    window.localStorage.setItem("vrt:viewer:mode:v2", JSON.stringify("wipe"));
    window.localStorage.setItem("vrt:viewer:zoom", JSON.stringify(150));

    const wrapper = mountViewer();

    expect(byId(wrapper, TEST_ID.modeWipe).attributes("aria-pressed")).toBe(
      "true",
    );
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("150%");
    expect(byId(wrapper, TEST_ID.wipeHandle).exists()).toBe(true);
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem("vrt:viewer:mode:v2", "garbage");
    window.localStorage.setItem("vrt:viewer:zoom", JSON.stringify(999));

    const wrapper = mountViewer();

    expect(
      byId(wrapper, TEST_ID.modeSidebyside).attributes("aria-pressed"),
    ).toBe("true");
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("100%");
  });

  it("persists view mode and zoom changes", async () => {
    const wrapper = mountViewer();

    await byId(wrapper, TEST_ID.modeOverlay).trigger("click");
    await byId(wrapper, TEST_ID.zoomIn).trigger("click");
    await nextTick();

    expect(window.localStorage.getItem("vrt:viewer:mode:v2")).toBe(
      JSON.stringify("overlay"),
    );
    expect(window.localStorage.getItem("vrt:viewer:zoom")).toBe(
      JSON.stringify(150),
    );
  });

  it("shows a fallback when a panel image fails to load", async () => {
    const wrapper = mountViewer();

    await byId(wrapper, TEST_ID.panelBaseline).find("img").trigger("error");

    const panel = byId(wrapper, TEST_ID.panelBaseline);
    expect(panel.find("img").exists()).toBe(false);
    expect(panel.text()).toContain("Image unavailable");
    expect(byId(wrapper, `${TEST_ID.panelBaseline}-retry`).exists()).toBe(true);
  });

  it("remounts the failed image on retry", async () => {
    const wrapper = mountViewer();
    const imageBeforeFailure = byId(wrapper, TEST_ID.panelBaseline).find(
      "img",
    ).element;

    await byId(wrapper, TEST_ID.panelBaseline).find("img").trigger("error");
    await byId(wrapper, `${TEST_ID.panelBaseline}-retry`).trigger("click");

    const panel = byId(wrapper, TEST_ID.panelBaseline);
    expect(panel.text()).not.toContain("Image unavailable");
    expect(panel.find("img").attributes("src")).toBe("/images/baseline.png");
    expect(panel.find("img").element).not.toBe(imageBeforeFailure);
  });

  it("hides the diff panel and the diff modes when no diffUrl", () => {
    const wrapper = mountViewer({
      baselineUrl: "/images/baseline.png",
      candidateUrl: "/images/candidate.png",
      diffUrl: undefined,
    });
    expect(byId(wrapper, TEST_ID.panelCandidate).exists()).toBe(true);
    expect(
      byId(wrapper, TEST_ID.panelCandidate).find("img").attributes("src"),
    ).toBe("/images/candidate.png");
    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(false);
    expect(byId(wrapper, TEST_ID.modeDiff).exists()).toBe(false);
    expect(byId(wrapper, TEST_ID.modeOverlay).exists()).toBe(false);
    expect(byId(wrapper, TEST_ID.modeWipe).exists()).toBe(false);
  });
});
