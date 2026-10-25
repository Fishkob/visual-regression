import { i18n } from "@/i18n";

// Composables run outside a component setup (and mutation callbacks fire later),
// so messages go through the singleton instead of useI18n().
export function translateMessage(
  key: string,
  params: Record<string, unknown> = {},
): string {
  return i18n.global.t(key, params);
}
