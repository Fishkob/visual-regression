import { describe, expect, it } from "vitest";
import type { TestMetadataDto } from "@sdk";
import { formatTags, parseTags, testFlakeLabel } from "../test-metadata.model";
import {
  mapTestMetadata,
  type TestMetadataSource,
} from "../test-metadata.mapper";

const metadataDto = (
  overrides: Partial<TestMetadataSource> = {},
): TestMetadataSource => ({
  id: "t-1",
  name: "checkout",
  description: "The checkout flow",
  tags: ["smoke", "checkout"],
  mutedUntil: "2026-11-01T10:00:00.000Z",
  muteReason: "flaky fixture",
  isMuted: true,
  sizePolicy: "PAD",
  flake: { transitions: 4, changed: 3, clean: 1 },
  ...overrides,
});

describe("mapTestMetadata", () => {
  it("maps every field", () => {
    expect(mapTestMetadata(metadataDto())).toEqual({
      id: "t-1",
      name: "checkout",
      description: "The checkout flow",
      tags: ["smoke", "checkout"],
      mutedUntil: "2026-11-01T10:00:00.000Z",
      muteReason: "flaky fixture",
      isMuted: true,
      sizePolicy: "PAD",
      flake: { transitions: 4, changed: 3, clean: 1 },
    });
  });

  it("defaults an unmuted test with no tags or flake data", () => {
    const dto = {
      id: "t-2",
      name: "login",
      tags: [],
      isMuted: false,
    } as unknown as TestMetadataDto;

    expect(mapTestMetadata(dto)).toEqual({
      id: "t-2",
      name: "login",
      description: null,
      tags: [],
      mutedUntil: null,
      muteReason: null,
      isMuted: false,
      sizePolicy: "FAIL",
      flake: { transitions: 0, changed: 0, clean: 0 },
    });
  });

  it("flattens the doubled tag array the OpenAPI schema declares", () => {
    const dto = metadataDto({
      tags: [["smoke"], ["checkout"], ["smoke"]],
    });

    expect(mapTestMetadata(dto)?.tags).toEqual(["smoke", "checkout"]);
  });

  it("drops empty/non-string tags and normalizes empty strings to null", () => {
    const dto = metadataDto({
      tags: ["smoke", "", 7] as unknown as string[],
      description: "",
      muteReason: "",
    });
    const metadata = mapTestMetadata(dto);

    expect(metadata?.tags).toEqual(["smoke"]);
    expect(metadata?.description).toBeNull();
    expect(metadata?.muteReason).toBeNull();
  });

  it("accepts Date columns from a direct call", () => {
    const metadata = mapTestMetadata(
      metadataDto({
        mutedUntil: new Date("2026-11-01T10:00:00.000Z") as unknown as string,
      }),
    );

    expect(metadata?.mutedUntil).toBe("2026-11-01T10:00:00.000Z");
  });

  it("maps a known size policy", () => {
    expect(
      mapTestMetadata(metadataDto({ sizePolicy: "RESIZE" }))?.sizePolicy,
    ).toBe("RESIZE");
  });

  it("defaults an unknown or missing size policy to FAIL", () => {
    expect(
      mapTestMetadata(metadataDto({ sizePolicy: "STRETCH" }))?.sizePolicy,
    ).toBe("FAIL");
    const withoutPolicy = {
      id: "t-3",
      name: "login",
      tags: [],
      isMuted: false,
      flake: { transitions: 0, changed: 0, clean: 0 },
    } as unknown as TestMetadataDto;

    expect(mapTestMetadata(withoutPolicy)?.sizePolicy).toBe("FAIL");
  });

  it("keeps 'not loaded' distinct from empty metadata", () => {
    expect(mapTestMetadata(undefined)).toBeUndefined();
  });
});

describe("tag helpers", () => {
  it("parses a comma-separated list into lowercase unique tags", () => {
    expect(parseTags(" Smoke, checkout ,SMOKE, ")).toEqual([
      "smoke",
      "checkout",
    ]);
  });

  it("formats tags for the editor input", () => {
    expect(formatTags(["smoke", "checkout"])).toBe("smoke, checkout");
    expect(formatTags([])).toBe("");
  });
});

describe("testFlakeLabel", () => {
  it("describes the 30-day transition count", () => {
    expect(testFlakeLabel({ transitions: 4, changed: 3, clean: 1 })).toBe(
      "4 transitions in 30 days",
    );
    expect(testFlakeLabel({ transitions: 0, changed: 0, clean: 0 })).toBe(
      "0 transitions in 30 days",
    );
  });
});
