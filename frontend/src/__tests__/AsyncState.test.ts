import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AsyncState from "@/components/AsyncState.vue";

const stubs = {
  ErrorAlert: {
    props: ["title", "message", "retry", "onRetry"],
    template:
      '<div data-testid="error"><span>{{ title }}</span><button data-testid="retry" @click="onRetry">retry</button></div>',
  },
  EmptyState: {
    props: ["title", "description"],
    template: '<div data-testid="empty">{{ title }} {{ description }}</div>',
  },
};

function mountState(
  props: {
    isLoading: boolean;
    error?: Error | null;
    errorTitle: string;
    empty: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    retry?: () => void;
  },
  slots: Record<string, unknown> = {},
) {
  return mount(AsyncState, {
    props,
    slots: {
      default: '<div data-testid="content">content</div>',
      ...slots,
    },
    global: { stubs },
  });
}

describe("AsyncState", () => {
  it("renders the loading slot while loading", () => {
    const wrapper = mountState(
      { isLoading: true, error: null, errorTitle: "boom", empty: false },
      {
        loading: '<div data-testid="skeleton">loading</div>',
      },
    );
    expect(wrapper.find('[data-testid="skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(false);
  });

  it("renders the error alert on error with a working retry", async () => {
    const retry = vi.fn();
    const wrapper = mountState({
      isLoading: false,
      error: new Error("Network error"),
      errorTitle: "Failed to load",
      empty: false,
      retry,
    });
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Failed to load");
    await wrapper.find('[data-testid="retry"]').trigger("click");
    expect(retry).toHaveBeenCalled();
  });

  it("renders the content slot when not loading, not error, not empty", () => {
    const wrapper = mountState({
      isLoading: false,
      error: null,
      errorTitle: "boom",
      empty: false,
    });
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(false);
  });

  it("renders the default EmptyState when empty and no empty slot given", () => {
    const wrapper = mountState({
      isLoading: false,
      error: null,
      errorTitle: "boom",
      empty: true,
      emptyTitle: "Nothing here",
      emptyDescription: "Try again",
    });
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Nothing here");
  });

  it("renders the custom empty slot when empty and one is given", () => {
    const wrapper = mountState(
      { isLoading: false, error: null, errorTitle: "boom", empty: true },
      {
        empty: '<div data-testid="custom-empty">custom</div>',
      },
    );
    expect(wrapper.find('[data-testid="custom-empty"]').exists()).toBe(true);
  });
});
