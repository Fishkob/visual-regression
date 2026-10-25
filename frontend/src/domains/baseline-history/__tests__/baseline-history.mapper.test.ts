import { describe, expect, it } from "vitest";
import type { BaselineRevisionDto } from "@sdk";
import {
  mapBaselineHistory,
  mapBaselineRevision,
  type BaselineRevisionSource,
} from "../baseline-history.mapper";

const fullDto: BaselineRevisionSource = {
  id: "rev-1",
  viewport: "1920x1080",
  browser: "Chrome",
  environment: "staging",
  imageUrl: "http://localhost:9000/vrt/baseline.png",
  signedImageUrl: "http://localhost:9000/vrt/baseline.png?signature=abc",
  imageHash: "hash-baseline",
  pageCount: null,
  pixelDiffThreshold: 12,
  reason: "approval",
  createdBy: "jane.doe",
  createdAt: "2024-05-01T10:30:00.000Z",
};

describe("mapBaselineRevision", () => {
  it("accepts the generated DTO shape unchanged", () => {
    const dto: BaselineRevisionDto = {
      ...fullDto,
      pageCount: null,
      createdBy: null,
    };

    expect(mapBaselineRevision(dto).id).toBe("rev-1");
  });

  it("prefers the presigned URL for rendering", () => {
    expect(mapBaselineRevision(fullDto).imageUrl).toBe(
      "http://localhost:9000/vrt/baseline.png?signature=abc",
    );
  });

  it("falls back to the canonical URL when the signed one is empty", () => {
    const revision = mapBaselineRevision({
      ...fullDto,
      signedImageUrl: "",
    });

    expect(revision.imageUrl).toBe("http://localhost:9000/vrt/baseline.png");
  });

  it("keeps a page count for PDF revisions", () => {
    const revision = mapBaselineRevision({ ...fullDto, pageCount: 7 });

    expect(revision.pageCount).toBe(7);
  });

  it("drops a missing page count instead of carrying null", () => {
    const revision = mapBaselineRevision(fullDto);

    expect(revision).not.toHaveProperty("pageCount");
  });

  it("drops an untyped page count the wire does not carry as a number", () => {
    const revision = mapBaselineRevision({
      ...fullDto,
      pageCount: { unexpected: true },
    });

    expect(revision).not.toHaveProperty("pageCount");
  });

  it("keeps the reason of the overwrite that replaced the baseline", () => {
    expect(mapBaselineRevision(fullDto).reason).toBe("approval");
    expect(mapBaselineRevision({ ...fullDto, reason: "restore" }).reason).toBe(
      "restore",
    );
    expect(mapBaselineRevision({ ...fullDto, reason: "import" }).reason).toBe(
      "import",
    );
  });

  it("drops an unknown actor instead of rendering a blank name", () => {
    expect(mapBaselineRevision(fullDto).createdBy).toBe("jane.doe");
    expect(
      mapBaselineRevision({ ...fullDto, createdBy: null }),
    ).not.toHaveProperty("createdBy");
  });

  it("round-trips the identity, hash, threshold and timestamp", () => {
    expect(mapBaselineRevision(fullDto)).toEqual({
      id: "rev-1",
      imageUrl: "http://localhost:9000/vrt/baseline.png?signature=abc",
      imageHash: "hash-baseline",
      pixelDiffThreshold: 12,
      reason: "approval",
      createdBy: "jane.doe",
      createdAt: "2024-05-01T10:30:00.000Z",
    });
  });
});

describe("mapBaselineHistory", () => {
  it("preserves the newest-first wire order", () => {
    const history = mapBaselineHistory([
      { ...fullDto, id: "newest" },
      { ...fullDto, id: "older" },
    ]);

    expect(history.map((revision) => revision.id)).toEqual(["newest", "older"]);
  });

  it("maps a missing list to an empty history", () => {
    expect(mapBaselineHistory(undefined)).toEqual([]);
    expect(mapBaselineHistory(null)).toEqual([]);
  });
});
