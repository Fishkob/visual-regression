import { createI18n } from "vue-i18n";
import en from "./messages/en.json";
import de from "./messages/de.json";

export const SUPPORTED_LOCALES = ["en", "de"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_STORAGE_KEY = "vrt-locale-v1";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function initialLocale(): SupportedLocale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
  } catch {
    // localStorage can be unavailable (private mode); fall back to English.
  }
  return "en";
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: "en",
  messages: { en, de },
});

export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persisting the preference is best-effort.
  }
  document.documentElement.lang = locale;
}

export function currentLocale(): SupportedLocale {
  const locale = i18n.global.locale.value;
  return isSupportedLocale(locale) ? locale : "en";
}
