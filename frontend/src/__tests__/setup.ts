import { afterEach } from "vitest";
import { config } from "@vue/test-utils";
import { i18n } from "@/i18n";

// Every component can call useI18n(); tests that need a specific locale can
// still change it, and the reset keeps one German test from leaking into the
// next file.
config.global.plugins = [i18n];

// jsdom ships no matchMedia, and @vueuse's useMediaQuery calls it during setup.
// `matches: false` is the phone layout, the narrowest branch — a test that wants
// the desktop one overrides this per file.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  i18n.global.locale.value = "en";
});
