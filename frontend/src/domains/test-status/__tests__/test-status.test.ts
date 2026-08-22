import { describe, it, expect } from "vitest";
import {
  getStatusConfig,
  iconFor,
  isPendingApproval,
  unknownStatusConfig,
  countPending,
} from "@/domains/test-status";
import type { StatusValue } from "@/domains/test-status";

describe("iconFor", () => {
  it("returns the icon from the canonical status config", () => {
    expect(iconFor("PENDING")).toBe(getStatusConfig("PENDING").icon);
    expect(iconFor("PENDING_APPROVAL")).toBe(
      getStatusConfig("PENDING_APPROVAL").icon,
    );
    expect(iconFor("UNCHANGED")).toBe(getStatusConfig("UNCHANGED").icon);
    expect(iconFor("APPROVED")).toBe(getStatusConfig("APPROVED").icon);
  });

  it("falls back to the unknown icon for unrecognized statuses", () => {
    expect(iconFor("SOMETHING_ELSE")).toBe(unknownStatusConfig.icon);
    expect(iconFor(null)).toBe(unknownStatusConfig.icon);
    expect(iconFor(undefined)).toBe(unknownStatusConfig.icon);
  });
});

describe("getStatusConfig", () => {
  it("maps every status value without falling through", () => {
    const statuses: StatusValue[] = [
      "PENDING",
      "UNCHANGED",
      "PENDING_APPROVAL",
      "APPROVED",
    ];

    for (const status of statuses) {
      expect(getStatusConfig(status).label).not.toBe("Baseline only");
    }
  });

  it("maps PENDING to a truthful config, not the Baseline only fallback", () => {
    expect(getStatusConfig("PENDING")).not.toBe(unknownStatusConfig);
    expect(getStatusConfig("PENDING").label).toBe("No baseline");
  });

  it("maps UNCHANGED and PENDING_APPROVAL labels", () => {
    expect(getStatusConfig("UNCHANGED").label).toBe("Unchanged");
    expect(getStatusConfig("PENDING_APPROVAL").label).toBe("Pending");
  });

  it("derives APPROVED from the UNCHANGED styling", () => {
    expect(getStatusConfig("APPROVED").label).toBe("Approved");
    expect(getStatusConfig("APPROVED").class).toBe(
      getStatusConfig("UNCHANGED").class,
    );
    expect(getStatusConfig("APPROVED").icon).toBe(
      getStatusConfig("UNCHANGED").icon,
    );
  });
});

describe("getStatusConfig", () => {
  it("resolves PENDING through the config", () => {
    const cfg = getStatusConfig("PENDING");

    expect(cfg.label).toBe("No baseline");
    expect(cfg).not.toBe(unknownStatusConfig);
  });

  it("resolves APPROVED through the config", () => {
    expect(getStatusConfig("APPROVED").label).toBe("Approved");
  });

  it("falls back to unknownStatusConfig for unrecognized statuses", () => {
    expect(getStatusConfig("SOMETHING_ELSE")).toBe(unknownStatusConfig);
  });

  it("falls back for null and undefined", () => {
    expect(getStatusConfig(null)).toBe(unknownStatusConfig);
    expect(getStatusConfig(undefined)).toBe(unknownStatusConfig);
  });
});

describe("isPendingApproval", () => {
  it("is true only for PENDING_APPROVAL", () => {
    expect(isPendingApproval("PENDING_APPROVAL")).toBe(true);
    expect(isPendingApproval("UNCHANGED")).toBe(false);
    expect(isPendingApproval("PENDING")).toBe(false);
    expect(isPendingApproval("APPROVED")).toBe(false);
    expect(isPendingApproval(null)).toBe(false);
    expect(isPendingApproval(undefined)).toBe(false);
  });
});

describe("countPending", () => {
  it("counts items whose status is PENDING_APPROVAL", () => {
    const items = [
      { status: "PENDING_APPROVAL" },
      { status: "UNCHANGED" },
      { status: "PENDING_APPROVAL" },
    ];
    expect(countPending(items, (i) => i.status)).toBe(2);
  });

  it("returns zero for an empty collection", () => {
    expect(countPending([], (i: { status?: string }) => i.status)).toBe(0);
  });

  it("works with a non-standard status field", () => {
    const items = [
      { latestStatus: "PENDING_APPROVAL" },
      { latestStatus: "PENDING" },
    ];
    expect(countPending(items, (i) => i.latestStatus)).toBe(1);
  });
});
