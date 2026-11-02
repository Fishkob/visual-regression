import type { TestKind } from "@/domains/test-kind";

export const SHARE_SCOPES = ["PROJECT", "TEST", "RUN"] as const;

export type ShareScope = (typeof SHARE_SCOPES)[number];

export function isShareScope(value: unknown): value is ShareScope {
  return SHARE_SCOPES.some((scope) => scope === value);
}

export interface ShareLink {
  id: string;
  scope: ShareScope;
  projectName: string;
  testName: string | null;
  branchName: string | null;
  runKey: string | null;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  hasPassphrase: boolean;
}

export interface CreateShareLinkInput {
  scope: ShareScope;
  testName?: string;
  branch?: string;
  runKey?: string;
  expiresInDays?: number;
  passphrase?: string;
}

export interface CreatedShareLink {
  link: ShareLink;
  token: string;
}

export interface PublicShareTest {
  name: string;
  kind?: TestKind;
  status: string;
  branchName: string | null;
  variantCount?: number;
}

export interface PublicRunCounts {
  pendingComparisons: number;
  mutedPending: number;
  pendingJobs: number;
  failedJobs: number;
  approved: number;
  testCount: number;
}

export interface PublicShareRun {
  key: string;
  branchName: string | null;
  state: string;
  finishedAt: string | null;
  counts: PublicRunCounts;
}

export interface PublicShareComparison {
  id: string;
  status: string;
  kind: TestKind;
  mismatchPixelCount: number;
  mismatchPageCount: number | null;
  pageCount: number | null;
  viewport: string;
  browser: string;
  environment: string;
  baselineUrl: string | null;
  candidateUrl: string | null;
  diffUrl: string | null;
}

export interface PublicShare {
  scope: ShareScope;
  projectName: string;
  testName: string | null;
  branchName: string | null;
  runKey: string | null;
  expiresAt: string;
  project: { name: string };
  test?: PublicShareTest;
  comparison?: PublicShareComparison;
  run?: PublicShareRun;
  tests?: PublicShareTest[];
}

export const SHARE_EXPIRY_DEFAULT_DAYS = 7;
export const SHARE_EXPIRY_MIN_DAYS = 1;
export const SHARE_EXPIRY_MAX_DAYS = 365;

export function sharePath(token: string): string {
  return `/share/${encodeURIComponent(token)}`;
}

// The full URL shown after creation. Built from the current origin so a copied
// link works without the dashboard's route prefix.
export function shareUrl(token: string): string {
  return `${window.location.origin}${sharePath(token)}`;
}

export function shareTargetLabel(link: ShareLink): string {
  if (link.scope === "TEST") {
    return [link.testName, link.branchName].filter(Boolean).join(" · ");
  }
  if (link.scope === "RUN") {
    return [link.runKey, link.branchName].filter(Boolean).join(" · ");
  }
  return link.projectName;
}

export function isShareLinkActive(link: ShareLink): boolean {
  if (link.revokedAt) return false;
  const expires = new Date(link.expiresAt).getTime();
  return !Number.isNaN(expires) && expires > Date.now();
}
