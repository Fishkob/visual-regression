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

type ViewerProps = {
  baselineUrl?: string;
  candidateUrl?: string;
  diffUrl?: string;
  mismatchPixelCount?: number;
};

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

  it("switches modes and zooms with keyboard shortcuts", async () => {
    const wrapper = mountViewer();

    await pressKey(window, "3");
    expect(byId(wrapper, TEST_ID.panelOverlay).exists()).toBe(true);

    await pressKey(window, "4");
    expect(byId(wrapper, TEST_ID.panelWipe).exists()).toBe(true);

    await pressKey(window, "2");
    expect(byId(wrapper, TEST_ID.panelDiff).exists()).toBe(true);
    expect(byId(wrapper, TEST_ID.panelBaseline).exists()).toBe(false);

    await pressKey(window, "1");
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

  it("renders the mismatch share from the baseline size", async () => {
    const wrapper = mountViewer({ ...defaultProps, mismatchPixelCount: 157 });
    const image = byId(wrapper, TEST_ID.panelBaseline).find("img");

    Object.defineProperty(image.element, "naturalWidth", {
      value: 250,
      configurable: true,
    });
    Object.defineProperty(image.element, "naturalHeight", {
      value: 157,
      configurable: true,
    });
    await image.trigger("load");

    expect(byId(wrapper, TEST_ID.mismatchPercent).text()).toBe("0.4%");
  });

  it("hides the mismatch percentage without a count or natural size", () => {
    const withoutCount = mountViewer();
    expect(byId(withoutCount, TEST_ID.mismatchPercent).exists()).toBe(false);

    const withoutSize = mountViewer({
      ...defaultProps,
      mismatchPixelCount: 157,
    });
    expect(byId(withoutSize, TEST_ID.mismatchPercent).exists()).toBe(false);
  });

  it("restores the last view mode and zoom from localStorage", () => {
    window.localStorage.setItem("vrt:viewer:mode", JSON.stringify("wipe"));
    window.localStorage.setItem("vrt:viewer:zoom", JSON.stringify(150));

    const wrapper = mountViewer();

    expect(byId(wrapper, TEST_ID.modeWipe).attributes("aria-pressed")).toBe(
      "true",
    );
    expect(byId(wrapper, TEST_ID.zoomLevel).text()).toBe("150%");
    expect(byId(wrapper, TEST_ID.wipeHandle).exists()).toBe(true);
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem("vrt:viewer:mode", "garbage");
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

    expect(window.localStorage.getItem("vrt:viewer:mode")).toBe(
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
