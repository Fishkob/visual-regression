import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, type VNode } from "vue";

import {
  getStatusBadge,
  getStatusCountBadge,
  statusLabelFor,
} from "@/components/StatusBadge";
import { i18n } from "@/i18n";
import type { StatusValue } from "@/domains/test-status";

const t = (key: string) => i18n.global.t(key);

function renderText(vnode: VNode): string {
  return mount(defineComponent({ render: () => vnode })).text();
}

describe("statusLabelFor", () => {
  it.each<[StatusValue, string]>([
    ["PENDING", "status.noBaseline"],
    ["UNCHANGED", "status.unchanged"],
    ["PENDING_APPROVAL", "status.pending"],
    ["APPROVED", "status.approved"],
  ])("labels %s with the %s key", (status, key) => {
    expect(statusLabelFor(status)).toBe(t(key));
  });

  it("distinguishes PENDING (no baseline) from PENDING_APPROVAL (pending)", () => {
    expect(statusLabelFor("PENDING")).not.toBe(
      statusLabelFor("PENDING_APPROVAL"),
    );
  });

  it("falls back to baseline-only for an unknown status", () => {
    expect(statusLabelFor("SOMETHING_ELSE")).toBe(t("status.baselineOnly"));
  });

  it.each([undefined, null, ""])(
    "falls back to baseline-only for %s",
    (status) => {
      expect(statusLabelFor(status)).toBe(t("status.baselineOnly"));
    },
  );
});

describe("getStatusBadge", () => {
  it("renders the label of the status it was given", () => {
    expect(renderText(getStatusBadge("PENDING_APPROVAL"))).toContain(
      t("status.pending"),
    );
    expect(renderText(getStatusBadge("APPROVED"))).toContain(
      t("status.approved"),
    );
  });

  it("renders the baseline-only label for an unknown status", () => {
    expect(renderText(getStatusBadge("SOMETHING_ELSE"))).toContain(
      t("status.baselineOnly"),
    );
  });

  it("uses the outline variant and the shared badge shell", () => {
    const badge = getStatusBadge("APPROVED");

    expect(badge.props!.variant).toBe("outline");
    expect(badge.props!.class).toContain("text-xs");
    expect(badge.props!.class).toContain("flex");
    expect(badge.props!.class).toContain("items-center");
    expect(badge.props!.class).toContain("gap-1");
  });

  it("paints pending in the warning colour, never the neutral fallback", () => {
    const badge = getStatusBadge("PENDING_APPROVAL");

    expect(badge.props!.class).toContain("border-status-warning");
    expect(badge.props!.class).toContain("text-status-warning");
    expect(badge.props!.class).not.toContain("text-status-neutral");
  });

  it("paints no-baseline in the info colour instead of the fallback", () => {
    const badge = getStatusBadge("PENDING");

    expect(badge.props!.class).toContain("border-status-info");
    expect(badge.props!.class).toContain("text-status-info");
    expect(badge.props!.class).not.toContain("text-status-neutral");
  });

  it("paints approved in the success colour", () => {
    const badge = getStatusBadge("APPROVED");

    expect(badge.props!.class).toContain("border-status-success");
    expect(badge.props!.class).toContain("text-status-success");
  });
});

describe("getStatusCountBadge", () => {
  it("renders the bare count when no label is given", () => {
    expect(renderText(getStatusCountBadge("PENDING_APPROVAL", 3))).toContain(
      "3",
    );
  });

  it("prefixes the count to the label when one is given", () => {
    expect(
      renderText(
        getStatusCountBadge("PENDING_APPROVAL", 3, { label: "changed" }),
      ),
    ).toContain("3 changed");
  });

  it("renders zero instead of swallowing it", () => {
    expect(renderText(getStatusCountBadge("APPROVED", 0))).toContain("0");
  });

  it("takes the colour from the status, like the single badge", () => {
    const badge = getStatusCountBadge("PENDING_APPROVAL", 2);

    expect(badge.props!.class).toContain("text-status-warning");
  });

  it("falls back to the neutral look for an unknown status", () => {
    const badge = getStatusCountBadge("SOMETHING_ELSE", 2);

    expect(badge.props!.class).toContain("text-status-neutral");
  });

  it("appends the caller's className instead of replacing the shell", () => {
    const badge = getStatusCountBadge("APPROVED", 1, { className: "ml-2" });

    expect(badge.props!.class).toContain("ml-2");
    expect(badge.props!.class).toContain("text-xs");
  });

  it("draws the requested icon and none by default", () => {
    const withIcon = mount(
      defineComponent({
        render: () => getStatusCountBadge("APPROVED", 1, { icon: "check" }),
      }),
    );
    const withoutIcon = mount(
      defineComponent({ render: () => getStatusCountBadge("APPROVED", 1) }),
    );

    expect(withIcon.find("svg").exists()).toBe(true);
    expect(withoutIcon.find("svg").exists()).toBe(false);
  });
});
