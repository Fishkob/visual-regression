import { describe, expect, it } from "vitest";
import type { CommentDto } from "@sdk";
import { mapComment, mapComments } from "../comment.mapper";
import { COMMENT_MAX_LENGTH } from "../comment.model";

const dto = (overrides: Partial<CommentDto> = {}): CommentDto => ({
  id: "c-1",
  projectName: "checkout",
  branchName: "main",
  testId: "t-1",
  comparisonId: "cmp-1",
  body: "The spacing changed here.\nIntended?",
  authorId: "u-1",
  author: "alice",
  createdAt: "2026-10-01T10:00:00.000Z",
  resolvedAt: null,
  resolvedBy: null,
  ...overrides,
});

describe("mapComment", () => {
  it("maps every field and preserves line breaks", () => {
    expect(mapComment(dto())).toEqual({
      id: "c-1",
      projectName: "checkout",
      branchName: "main",
      testId: "t-1",
      comparisonId: "cmp-1",
      body: "The spacing changed here.\nIntended?",
      authorId: "u-1",
      author: "alice",
      createdAt: "2026-10-01T10:00:00.000Z",
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  it("defaults absent and resolved values defensively", () => {
    const mapped = mapComment({
      id: "c-2",
      projectName: "checkout",
      testId: "t-1",
      comparisonId: null,
      body: "",
      author: "bob",
    } as unknown as CommentDto);

    expect(mapped.branchName).toBeNull();
    expect(mapped.comparisonId).toBeNull();
    expect(mapped.authorId).toBeNull();
    expect(mapped.resolvedAt).toBeNull();
    expect(mapped.createdAt).toBe("");
  });

  it("maps a list and never returns undefined entries", () => {
    expect(mapComments([dto(), dto({ id: "c-2" })])).toHaveLength(2);
    expect(mapComments(undefined)).toEqual([]);
  });

  it("exposes the contract body limit", () => {
    expect(COMMENT_MAX_LENGTH).toBe(4000);
  });
});
