import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ImageDisplay from "@/components/ImageDisplay.vue";

describe("ImageDisplay", () => {
  it("renders the label and the image url", () => {
    const wrapper = mount(ImageDisplay, {
      props: { label: "Baseline", url: "/images/baseline.png" },
    });

    expect(wrapper.text()).toContain("Baseline");
    const img = wrapper.find("img");
    expect(img.attributes("src")).toBe("/images/baseline.png");
    expect(img.attributes("alt")).toBe("Baseline");
  });

  it("shows a fallback when the image fails to load", async () => {
    const wrapper = mount(ImageDisplay, {
      props: { label: "Baseline", url: "/images/baseline.png" },
    });

    await wrapper.find("img").trigger("error");

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Image unavailable");
    expect(wrapper.text()).toContain("Baseline");
    expect(wrapper.find("button").text()).toBe("Retry");
  });

  it("remounts the image on retry", async () => {
    const wrapper = mount(ImageDisplay, {
      props: { label: "Candidate", url: "/images/candidate.png" },
    });
    const imageBeforeFailure = wrapper.find("img").element;

    await wrapper.find("img").trigger("error");
    await wrapper.find("button").trigger("click");

    const img = wrapper.find("img");
    expect(wrapper.text()).not.toContain("Image unavailable");
    expect(img.attributes("src")).toBe("/images/candidate.png");
    expect(img.attributes("alt")).toBe("Candidate");
    expect(img.element).not.toBe(imageBeforeFailure);
  });

  it("resets the fallback when the url changes", async () => {
    const wrapper = mount(ImageDisplay, {
      props: { label: "Baseline", url: "/images/baseline.png" },
    });

    await wrapper.find("img").trigger("error");
    await wrapper.setProps({ url: "/images/other.png" });

    const img = wrapper.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("/images/other.png");
  });

  it("renders nothing when no url is provided", () => {
    const wrapper = mount(ImageDisplay, {
      props: { label: "Baseline" },
    });

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Baseline");
  });
});
