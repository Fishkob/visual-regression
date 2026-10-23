import { describe, expect, it } from "vitest";
import { formatRelativeAge } from "@/lib/format-date";

describe("formatRelativeAge", () => {
  it("formats minutes and days", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(formatRelativeAge("2026-10-22T11:30:00Z", now)).toContain("30");
    expect(formatRelativeAge("2026-10-20T12:00:00Z", now)).toContain("2");
  });

  it("returns a dash for an invalid date", () => {
    expect(formatRelativeAge("not-a-date")).toBe("—");
  });
});
