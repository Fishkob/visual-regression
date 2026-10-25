import type { CreatedShareLinkDto, PublicShareDto, ShareLinkDto } from "@sdk";
import { isTestKind, type TestKind } from "@/domains/test-kind";
import {
  type CreatedShareLink,
  type PublicRunCounts,
  type PublicShare,
  type PublicShareRun,
  type PublicShareTest,
  type PublicShareTest as PublicTest,
  type ShareLink,
  type ShareScope,
  isShareScope,
} from "./share-link.model";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function presentIso(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function presentScope(value: unknown): ShareScope {
  return isShareScope(value) ? value : "PROJECT";
}

function presentKind(value: unknown): TestKind | undefined {
  return typeof value === "string" && isTestKind(value) ? value : undefined;
}

export function mapShareLink(
  dto: ShareLinkDto | undefined,
): ShareLink | undefined {
  if (!dto) return undefined;
  return {
    id: dto.id ?? "",
    scope: presentScope(dto.scope),
    projectName: dto.projectName ?? "",
    testName: text(dto.testName),
    branchName: text(dto.branchName),
    runKey: text(dto.runKey),
    createdBy: text(dto.createdBy),
    createdAt: presentIso(dto.createdAt) ?? "",
    expiresAt: presentIso(dto.expiresAt) ?? "",
    revokedAt: presentIso(dto.revokedAt),
    lastAccessedAt: presentIso(dto.lastAccessedAt),
    accessCount: count(dto.accessCount),
    hasPassphrase: dto.hasPassphrase === true,
  };
}

export function mapShareLinks(dtos: ShareLinkDto[] | undefined): ShareLink[] {
  return (dtos ?? [])
    .map(mapShareLink)
    .filter((link): link is ShareLink => link !== undefined);
}

export function mapCreatedShareLink(
  dto: CreatedShareLinkDto | undefined,
): CreatedShareLink | undefined {
  const link = mapShareLink(dto?.link);
  if (!dto || !link) return undefined;
  return { link, token: dto.token ?? "" };
}

function mapPublicTest(
  value: unknown,
  fallback: { name?: string | null; branchName?: string | null } = {},
): PublicTest | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const name = text(raw.name) ?? text(fallback.name);
  if (!name) return undefined;
  return {
    name,
    ...(presentKind(raw.kind) ? { kind: presentKind(raw.kind) } : {}),
    status: text(raw.status) ?? "",
    branchName: text(raw.branchName) ?? text(fallback.branchName),
    ...(raw.variantCount === undefined
      ? {}
      : { variantCount: count(raw.variantCount) }),
  };
}

function mapPublicTests(value: unknown): PublicShareTest[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => mapPublicTest(entry))
    .filter((entry): entry is PublicShareTest => entry !== undefined);
}

function mapCounts(value: unknown): PublicRunCounts {
  const raw = record(value);
  return {
    pendingComparisons: count(raw?.pendingComparisons),
    mutedPending: count(raw?.mutedPending),
    pendingJobs: count(raw?.pendingJobs),
    failedJobs: count(raw?.failedJobs),
    approved: count(raw?.approved),
    testCount: count(raw?.testCount),
  };
}

function mapPublicRun(
  value: unknown,
  fallback: { key?: string | null; branchName?: string | null },
): PublicShareRun | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const key = text(raw.key) ?? text(fallback.key);
  if (!key) return undefined;
  return {
    key,
    branchName: text(raw.branchName) ?? text(fallback.branchName),
    state: text(raw.state) ?? "",
    finishedAt: presentIso(raw.finishedAt),
    counts: mapCounts(raw.counts),
  };
}

export type PublicShareSource = Omit<
  PublicShareDto,
  "project" | "test" | "run" | "tests"
> & {
  project?: unknown;
  test?: unknown;
  run?: unknown;
  tests?: unknown;
};

// Nested public payloads are typed as free-form records by the generated SDK,
// so every section is re-validated here instead of trusted at the view.
export function mapPublicShare(
  dto: PublicShareSource | undefined,
): PublicShare | undefined {
  if (!dto) return undefined;
  const project = record(dto.project);
  const projectName = text(project?.name) ?? dto.projectName ?? "";
  const test = mapPublicTest(dto.test, {
    name: dto.testName,
    branchName: dto.branchName,
  });
  const run = mapPublicRun(dto.run, {
    key: dto.runKey,
    branchName: dto.branchName,
  });
  return {
    scope: presentScope(dto.scope),
    projectName,
    testName: text(dto.testName),
    branchName: text(dto.branchName),
    runKey: text(dto.runKey),
    expiresAt: presentIso(dto.expiresAt) ?? "",
    project: { name: projectName },
    ...(test ? { test } : {}),
    ...(run ? { run } : {}),
    ...(Array.isArray(dto.tests) ? { tests: mapPublicTests(dto.tests) } : {}),
  };
}
