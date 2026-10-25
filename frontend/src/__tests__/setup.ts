import { afterEach } from "vitest";
import { config } from "@vue/test-utils";
import { i18n } from "@/i18n";

// Every component can call useI18n(); tests that need a specific locale can
// still change it, and the reset keeps one German test from leaking into the
// next file.
config.global.plugins = [i18n];

afterEach(() => {
  i18n.global.locale.value = "en";
});
