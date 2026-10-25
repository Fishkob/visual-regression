import { describe, expect, it } from "vitest";
import type { PublicShareDto, ShareLinkDto } from "@sdk";
import {
  mapCreatedShareLink,
  mapPublicShare,
  mapShareLink,
  mapShareLinks,
  type PublicShareSource,
} from "../share-link.mapper";
import {
  isShareLinkActive,
  sharePath,
  shareTargetLabel,
  shareUrl,
} from "../share-link.model";

const linkDto = (overrides: Partial<ShareLinkDto> = {}): ShareLinkDto => ({
  id: "link-1",
  scope: "PROJECT",
  projectName: "checkout",
  testName: null,
  branchName: null,
  runKey: null,
  createdBy: "alice",
  createdAt: "2026-10-01T10:00:00.000Z",
  expiresAt: "2026-10-08T10:00:00.000Z",
  revokedAt: null,
  lastAccessedAt: null,
  accessCount: 3,
  hasPassphrase: true,
  ...overrides,
});

const publicProject = (
  overrides: Partial<PublicShareSource> = {},
): PublicShareSource => ({
  scope: "PROJECT",
  projectName: "checkout",
  testName: null,
  branchName: null,
  runKey: null,
  expiresAt: "2026-10-08T10:00:00.000Z",
  project: { name: "checkout" },
  tests: [
    {
      name: "login",
      kind: "image",
      status: "PENDING_APPROVAL",
      branchName: "main",
    },
  ],
  ...overrides,
});

describe("mapShareLink", () => {
  it("maps the link fields", () => {
    expect(mapShareLink(linkDto())).toEqual({
      id: "link-1",
      scope: "PROJECT",
      projectName: "checkout",
      testName: null,
      branchName: null,
      runKey: null,
      createdBy: "alice",
      createdAt: "2026-10-01T10:00:00.000Z",
      expiresAt: "2026-10-08T10:00:00.000Z",
      revokedAt: null,
      lastAccessedAt: null,
      accessCount: 3,
      hasPassphrase: true,
    });
  });

  it("defaults unknown values defensively", () => {
    const mapped = mapShareLink({
      id: "link-2",
      scope: "STRANGE",
      projectName: "checkout",
    } as unknown as ShareLinkDto);

    expect(mapped?.scope).toBe("PROJECT");
    expect(mapped?.accessCount).toBe(0);
    expect(mapped?.hasPassphrase).toBe(false);
    expect(mapped?.revokedAt).toBeNull();
  });

  it("maps a list and keeps 'not loaded' distinct", () => {
    expect(mapShareLinks([linkDto()])).toHaveLength(1);
    expect(mapShareLinks(undefined)).toEqual([]);
    expect(mapShareLink(undefined)).toBeUndefined();
  });

  it("maps the created payload", () => {
    expect(
      mapCreatedShareLink({ link: linkDto(), token: "tok-1" }),
    ).toMatchObject({ token: "tok-1", link: { id: "link-1" } });
    expect(mapCreatedShareLink(undefined)).toBeUndefined();
    expect(mapCreatedShareLink({ token: "t" } as never)).toBeUndefined();
  });
});

describe("share paths and labels", () => {
  it("builds the public path and full URL", () => {
    expect(sharePath("tok-1")).toBe("/share/tok-1");
    expect(shareUrl("tok-1")).toBe(`${window.location.origin}/share/tok-1`);
  });

  it("labels the target of each scope", () => {
    expect(shareTargetLabel(mapShareLink(linkDto())!)).toBe("checkout");
    expect(
      shareTargetLabel(
        mapShareLink(
          linkDto({ scope: "TEST", testName: "login", branchName: "main" }),
        )!,
      ),
    ).toBe("login · main");
    expect(
      shareTargetLabel(
        mapShareLink(
          linkDto({ scope: "RUN", runKey: "ci-42", branchName: "main" }),
        )!,
      ),
    ).toBe("ci-42 · main");
  });

  it("treats revoked and past links as inactive", () => {
    expect(isShareLinkActive(mapShareLink(linkDto())!)).toBe(
      new Date("2026-10-08T10:00:00.000Z").getTime() > Date.now(),
    );
    expect(
      isShareLinkActive(
        mapShareLink(linkDto({ revokedAt: "2026-10-02T10:00:00.000Z" }))!,
      ),
    ).toBe(false);
    expect(
      isShareLinkActive(
        mapShareLink(linkDto({ expiresAt: "2020-01-01T00:00:00.000Z" }))!,
      ),
    ).toBe(false);
  });
});

describe("mapPublicShare", () => {
  it("maps a project share with its tests", () => {
    const share = mapPublicShare(publicProject());

    expect(share?.scope).toBe("PROJECT");
    expect(share?.project).toEqual({ name: "checkout" });
    expect(share?.tests).toEqual([
      {
        name: "login",
        kind: "image",
        status: "PENDING_APPROVAL",
        branchName: "main",
      },
    ]);
    expect(share?.test).toBeUndefined();
    expect(share?.run).toBeUndefined();
  });

  it("maps a test share with the branch and variant count", () => {
    const share = mapPublicShare(
      publicProject({
        scope: "TEST",
        testName: "login",
        branchName: "main",
        test: {
          name: "login",
          kind: "pdf",
          status: "APPROVED",
          branchName: "main",
          variantCount: 4,
        },
        tests: undefined,
      }),
    );

    expect(share?.test).toMatchObject({
      name: "login",
      kind: "pdf",
      status: "APPROVED",
      branchName: "main",
      variantCount: 4,
    });
  });

  it("maps a run share with every count", () => {
    const share = mapPublicShare(
      publicProject({
        scope: "RUN",
        runKey: "ci-42",
        branchName: "main",
        run: {
          key: "ci-42",
          branchName: "main",
          state: "pending",
          finishedAt: null,
          counts: {
            pendingComparisons: 3,
            mutedPending: 2,
            pendingJobs: 1,
            failedJobs: 4,
            approved: 5,
            testCount: 6,
          },
        },
        tests: undefined,
      }),
    );

    expect(share?.run).toEqual({
      key: "ci-42",
      branchName: "main",
      state: "pending",
      finishedAt: null,
      counts: {
        pendingComparisons: 3,
        mutedPending: 2,
        pendingJobs: 1,
        failedJobs: 4,
        approved: 5,
        testCount: 6,
      },
    });
  });

  it("defaults missing sections and malformed entries", () => {
    const share = mapPublicShare({
      scope: "STRAIGHT",
      projectName: "checkout",
      expiresAt: "",
      project: null,
      tests: [null, { name: "" }, { name: "ok", kind: "video", status: 7 }],
    } as unknown as PublicShareSource);

    expect(share?.scope).toBe("PROJECT");
    expect(share?.project).toEqual({ name: "checkout" });
    expect(share?.tests).toEqual([
      { name: "ok", status: "", branchName: null },
    ]);
    expect(mapPublicShare(undefined)).toBeUndefined();
  });

  it("accepts the generated loose DTO shape", () => {
    const dto = {
      scope: "TEST",
      projectName: "checkout",
      testName: "login",
      branchName: null,
      runKey: null,
      expiresAt: "2026-10-08T10:00:00.000Z",
      project: { name: "checkout" },
      test: {
        name: "login",
        kind: "image",
        status: "PENDING_APPROVAL",
        branchName: null,
        variantCount: 1,
      },
    } as PublicShareDto;

    expect(mapPublicShare(dto)?.test?.name).toBe("login");
  });
});
