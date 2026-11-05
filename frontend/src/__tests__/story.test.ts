import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createRoutedView } from "@/lib/story";

const push = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
}));

const Target = defineComponent({
  name: "TargetView",
  setup: () => () => h("div", { "data-testid": "target" }),
});

function mountRouted(props: { initialRoute?: string } = {}) {
  const Routed = createRoutedView(Target);
  return mount(Routed, { props });
}

describe("createRoutedView", () => {
  beforeEach(() => {
    push.mockReset();
    push.mockResolvedValue(undefined);
  });

  it("renders immediately when there is no initial route", () => {
    const wrapper = mountRouted();

    expect(push).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="target"]').exists()).toBe(true);
  });

  it("holds the view back until the initial navigation resolves", async () => {
    let resolvePush: () => void = () => {};
    push.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePush = resolve;
      }),
    );

    const wrapper = mountRouted({ initialRoute: "/runs/42" });

    expect(push).toHaveBeenCalledWith("/runs/42");
    expect(wrapper.find('[data-testid="target"]').exists()).toBe(false);

    resolvePush();
    await flushPromises();

    expect(wrapper.find('[data-testid="target"]').exists()).toBe(true);
  });
});
