import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import InteractiveImageViewer from "@/components/detail-panels/InteractiveImageViewer.vue";

describe("InteractiveImageViewer", () => {
  const defaultProps = {
    baselineUrl: "/images/baseline.png",
    candidateUrl: "/images/candidate.png",
    diffUrl: "/images/diff.png",
  };

  it("renders baseline, candidate and diff panels", () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    expect(wrapper.find('[data-testid="panel-baseline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="panel-candidate"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="panel-diff"]').exists()).toBe(true);
  });

  it("defaults to Side by Side mode", () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    const candidatePanel = wrapper.find('[data-testid="panel-candidate"]');
    expect(candidatePanel.find("img").attributes("src")).toBe(
      "/images/candidate.png",
    );
    expect(candidatePanel.text()).toContain("Candidate");
    const diffPanel = wrapper.find('[data-testid="panel-diff"]');
    expect(diffPanel.find("img").attributes("src")).toBe("/images/diff.png");
    expect(diffPanel.text()).toContain("Diff");
  });

  it("shows only the diff panel in Diff Only mode", async () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    await wrapper.find('[data-testid="mode-diff"]').trigger("click");
    expect(wrapper.find('[data-testid="panel-baseline"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="panel-candidate"]').exists()).toBe(
      false,
    );
    const diffPanel = wrapper.find('[data-testid="panel-diff"]');
    expect(diffPanel.exists()).toBe(true);
    expect(diffPanel.find("img").attributes("src")).toBe("/images/diff.png");
    expect(diffPanel.text()).toContain("Diff");
  });

  it("returns to Side by Side mode", async () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    await wrapper.find('[data-testid="mode-diff"]').trigger("click");
    await wrapper.find('[data-testid="mode-sidebyside"]').trigger("click");
    expect(wrapper.find('[data-testid="panel-baseline"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="panel-candidate"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="panel-diff"]').exists()).toBe(true);
  });

  it("shows zoom controls", () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    expect(wrapper.find('[data-testid="zoom-in"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="zoom-out"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="zoom-reset"]').exists()).toBe(true);
  });

  it("zooms in on click", async () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    await wrapper.find('[data-testid="zoom-in"]').trigger("click");
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe("150%");
  });

  it("zooms out on click", async () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    await wrapper.find('[data-testid="zoom-in"]').trigger("click");
    await wrapper.find('[data-testid="zoom-out"]').trigger("click");
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe("100%");
  });

  it("resets zoom on reset click", async () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    await wrapper.find('[data-testid="zoom-in"]').trigger("click");
    await wrapper.find('[data-testid="zoom-reset"]').trigger("click");
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe("100%");
  });

  it("disables zoom out at minimum zoom (50%)", async () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    await wrapper.find('[data-testid="zoom-out"]').trigger("click");
    await wrapper.find('[data-testid="zoom-out"]').trigger("click");
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe("50%");
    expect(
      wrapper.find('[data-testid="zoom-out"]').attributes("disabled"),
    ).toBe("");
  });

  it("disables zoom in at maximum zoom (200%)", async () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: defaultProps,
    });
    await wrapper.find('[data-testid="zoom-in"]').trigger("click");
    await wrapper.find('[data-testid="zoom-in"]').trigger("click");
    await wrapper.find('[data-testid="zoom-in"]').trigger("click");
    expect(wrapper.find('[data-testid="zoom-level"]').text()).toBe("200%");
    expect(wrapper.find('[data-testid="zoom-in"]').attributes("disabled")).toBe(
      "",
    );
  });

  it("hides the diff panel and Diff Only mode when no diffUrl", () => {
    const wrapper = mount(InteractiveImageViewer, {
      props: {
        baselineUrl: "/images/baseline.png",
        candidateUrl: "/images/candidate.png",
        diffUrl: undefined,
      },
    });
    expect(wrapper.find('[data-testid="panel-candidate"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="panel-candidate"] img').attributes("src"),
    ).toBe("/images/candidate.png");
    expect(wrapper.find('[data-testid="panel-diff"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mode-diff"]').exists()).toBe(false);
  });
});
