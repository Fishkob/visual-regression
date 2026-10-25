import { describe, expect, it, beforeEach } from "vitest";
import { i18n, setLocale, currentLocale, isSupportedLocale } from "@/i18n";

describe("i18n", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocale("en");
  });

  it("translates navigation in English and German", () => {
    expect(i18n.global.t("nav.inbox")).toBe("Inbox");
    setLocale("de");
    expect(i18n.global.t("nav.inbox")).toBe("Posteingang");
    expect(currentLocale()).toBe("de");
  });

  it("persists the locale and updates the document language", () => {
    setLocale("de");
    expect(window.localStorage.getItem("vrt-locale-v1")).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("rejects unsupported locales", () => {
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale("de")).toBe(true);
  });
});
