import { describe, it, expect } from "vitest";
import { getStatusBadge } from "@/components/StatusBadge";
import type { VisualTestStatus } from "@/domains/test-status";

describe("getStatusBadge", () => {
  it("returns a VNode for PENDING_APPROVAL status", () => {
    const badge = getStatusBadge("PENDING_APPROVAL");

    expect(badge).toBeDefined();
    expect(badge.props).toBeDefined();
  });

  it("returns a VNode for APPROVED status", () => {
    const badge = getStatusBadge("APPROVED");

    expect(badge).toBeDefined();
    expect(badge.props).toBeDefined();
  });

  it("returns VNode for undefined status", () => {
    const badge = getStatusBadge(undefined);

    expect(badge).toBeDefined();
    expect(badge.props).toBeDefined();
  });

  it("returns VNode for null status", () => {
    const badge = getStatusBadge(null);

    expect(badge).toBeDefined();
    expect(badge.props).toBeDefined();
  });

  it("returns VNode for empty string", () => {
    const badge = getStatusBadge("");

    expect(badge).toBeDefined();
    expect(badge.props).toBeDefined();
  });

  describe("badge props", () => {
    it("sets variant to outline", () => {
      const badge = getStatusBadge("PENDING_APPROVAL");

      expect(badge.props!.variant).toBe("outline");
    });

    it("includes pending styling for PENDING_APPROVAL", () => {
      const badge = getStatusBadge("PENDING_APPROVAL");

      expect(badge.props!.class).toContain("border-amber-500");
      expect(badge.props!.class).toContain("text-amber-600");
    });

    it("shows no-baseline styling for PENDING instead of the fallback", () => {
      const badge = getStatusBadge("PENDING");

      expect(badge.props!.class).toContain("border-sky-500");
      expect(badge.props!.class).toContain("text-sky-600");
      expect(badge.props!.class).not.toContain("text-slate-500");
    });

    it("includes ok styling for non-pending statuses", () => {
      const badge = getStatusBadge("APPROVED");

      expect(badge.props!.class).toContain("border-emerald-500");
      expect(badge.props!.class).toContain("text-emerald-600");
    });

    it("includes text-xs in class", () => {
      const badge = getStatusBadge("APPROVED");

      expect(badge.props!.class).toContain("text-xs");
    });

    it("includes flex items-center in class", () => {
      const badge = getStatusBadge("APPROVED");

      expect(badge.props!.class).toContain("flex");
      expect(badge.props!.class).toContain("items-center");
    });

    it("includes gap-1 in class", () => {
      const badge = getStatusBadge("APPROVED");

      expect(badge.props!.class).toContain("gap-1");
    });
  });

  describe("badge children", () => {
    it("has children defined", () => {
      const badge = getStatusBadge("PENDING_APPROVAL");

      expect(badge.children).toBeDefined();
    });
  });
});

describe("VisualTestStatus", () => {
  it("supports all three status values", () => {
    const statuses: VisualTestStatus[] = [
      "UNCHANGED",
      "PENDING_APPROVAL",
      "APPROVED",
    ];

    expect(statuses).toHaveLength(3);
  });
});
