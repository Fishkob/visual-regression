import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PdfPageNavigation from "@/components/pdf/PdfPageNavigation.vue";

const stubs = {
  Button: {
    template: '<button :disabled="$attrs.disabled"><slot/></button>',
  },
};

describe("PdfPageNavigation", () => {
  it("shows correct page text", () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 1, pageCount: 10 },
      global: { stubs },
    });

    expect(
      wrapper.find('[data-testid="pdf-page-navigation"]').text(),
    ).toContain("Page 1 of 10");
  });

  it("clamps pageCount to minimum of 1", () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 1, pageCount: 0 },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Page 1 of 1");
  });

  it("clamps currentPage to pageCount", () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 20, pageCount: 5 },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Page 5 of 5");
  });

  it("emits update:currentPage with prev page on prev click", async () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 3, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const prevBtn = buttons.filter((w) => w.text().includes("Prev"))[0];
    await prevBtn.trigger("click");

    expect(wrapper.emitted("update:currentPage")?.[0]).toEqual([2]);
  });

  it("emits update:currentPage with next page on next click", async () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 3, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const nextBtn = buttons.filter((w) => w.text().includes("Next"))[0];
    await nextBtn.trigger("click");

    expect(wrapper.emitted("update:currentPage")?.[0]).toEqual([4]);
  });

  it("does not emit prev on first page", async () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 1, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const prevBtn = buttons.filter((w) => w.text().includes("Prev"))[0];
    await prevBtn.trigger("click");

    expect(wrapper.emitted("update:currentPage")).toBeUndefined();
  });

  it("does not emit next on last page", async () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 10, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const nextBtn = buttons.filter((w) => w.text().includes("Next"))[0];
    await nextBtn.trigger("click");

    expect(wrapper.emitted("update:currentPage")).toBeUndefined();
  });

  it("disables prev button on first page", () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 1, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const prevBtn = buttons.filter((w) => w.text().includes("Prev"))[0];
    expect(prevBtn.attributes("disabled")).toBeDefined();
  });

  it("disables next button on last page", () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 10, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const nextBtn = buttons.filter((w) => w.text().includes("Next"))[0];
    expect(nextBtn.attributes("disabled")).toBeDefined();
  });

  it("does not disable prev button on non-first page", () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 5, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const prevBtn = buttons.filter((w) => w.text().includes("Prev"))[0];
    expect(prevBtn.attributes("disabled")).toBeUndefined();
  });

  it("does not disable next button on non-last page", () => {
    const wrapper = mount(PdfPageNavigation, {
      props: { currentPage: 5, pageCount: 10 },
      global: { stubs },
    });

    const buttons = wrapper.findAll("button");
    const nextBtn = buttons.filter((w) => w.text().includes("Next"))[0];
    expect(nextBtn.attributes("disabled")).toBeUndefined();
  });
});
