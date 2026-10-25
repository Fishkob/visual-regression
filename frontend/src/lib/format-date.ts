import { currentLocale } from "@/i18n";

export function formatRelativeAge(
  iso: string,
  now = new Date(),
  locale = currentLocale(),
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMinutes = Math.round((then - now.getTime()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }
  return formatter.format(Math.round(diffHours / 24), "day");
}

// Absolute timestamps follow the active locale while keeping the familiar
// date+time shape the UI has always shown.
export function formatDateTime(
  value: Date | string | null | undefined,
  locale = currentLocale(),
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }
  return date.toLocaleString(locale);
}
