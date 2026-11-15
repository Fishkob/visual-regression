import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n";
import { sdkErrorMessage, sdkErrorReason } from "@/lib/sdk";

describe("sdkErrorMessage", () => {
  afterEach(() => {
    i18n.global.locale.value = "en";
  });

  it("translates a known reason instead of showing the English message", () => {
    const message = sdkErrorMessage({
      message: "The comparison you reviewed is no longer pending",
      reason: "comparison_superseded",
    });

    expect(message).toBe(i18n.global.t("errorReasons.comparisonSuperseded"));
  });

  it("falls back to the message for a reason this client does not know", () => {
    expect(
      sdkErrorMessage({ message: "raw detail", reason: "added_next_year" }),
    ).toBe("raw detail");
  });

  it("keeps a plain string error", () => {
    expect(sdkErrorMessage("boom")).toBe("boom");
  });

  it("uses the fallback when the payload carries no message", () => {
    expect(sdkErrorMessage({}, "fallback")).toBe("fallback");
  });
});

describe("sdkErrorReason", () => {
  it("reads the reason from an object payload", () => {
    expect(sdkErrorReason({ reason: "test_inherited" })).toBe("test_inherited");
  });

  it("returns undefined for anything without a string reason", () => {
    expect(sdkErrorReason("test_inherited")).toBeUndefined();
    expect(sdkErrorReason(null)).toBeUndefined();
    expect(sdkErrorReason({ reason: 42 })).toBeUndefined();
  });
});
