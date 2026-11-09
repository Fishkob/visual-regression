import type {
  AuditControllerListResponses,
  InvitePreviewDto,
  PaginationMetaDto,
  RunApprovalDto,
  RunFailedJobDto,
  RunPendingDto,
  RunStatusDto,
  RunUploadDto,
  TrendsControllerGetResponses,
} from "@sdk";

import type { FulfillResponse } from "../../ct/routes/api.routes";
import {
  DEMO_BASELINE,
  DEMO_CANDIDATE,
  DEMO_DIFF,
} from "../../ct/mocks/demoImages.mocks";
import type { RunSource } from "@/domains/runs/run.mapper";
import type { SessionSource } from "@/domains/security/security.mapper";
import type { PublicShareSource } from "@/domains/share-links/share-link.mapper";
import type { UserSource } from "@/domains/users/user.mapper";

// The list endpoints are typed through their generated response type, so a DTO
// change breaks `pnpm typecheck` here instead of rendering `undefined` into a
// screenshot. The three free-form nullable columns cross the mapper's documented
// source aliases (see UserSource/SessionSource/RunSource), which is the same
// widening the production mappers use.

// Fixtures for the pages the gallery reached only through the e2e suite: the
// admin surfaces, the three stand-alone screens (login, forbidden, change
// password), the public share page and the run detail. Every value is absolute
// so the frozen clock in `tests/quality/theme.ts` renders the same strings on
// every run.
export function json(body: unknown, status = 200): FulfillResponse {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

const META = {
  page: 1,
  limit: 20,
  total: 3,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

export const USERS_RESPONSE = json([
  {
    id: "u-admin",
    username: "admin",
    role: "ADMIN",
    isActive: true,
    mustChangePassword: false,
    deactivatedAt: null,
    createdBy: null,
    createdAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "u-qa",
    username: "qa-team",
    role: "MEMBER",
    isActive: true,
    mustChangePassword: false,
    deactivatedAt: null,
    createdBy: "admin",
    createdAt: "2026-09-12T14:30:00.000Z",
  },
  {
    id: "u-designer",
    username: "design-review",
    role: "VIEWER",
    isActive: false,
    mustChangePassword: true,
    deactivatedAt: "2026-10-01T08:15:00.000Z",
    createdBy: "admin",
    createdAt: "2026-09-20T10:05:00.000Z",
  },
] satisfies UserSource[]);

export const SESSIONS_RESPONSE = json([
  {
    id: "s-current",
    createdAt: "2026-10-22T09:12:00.000Z",
    lastSeenAt: "2026-10-22T11:58:00.000Z",
    expiresAt: "2026-11-21T09:12:00.000Z",
    ip: "203.0.113.24",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    isCurrent: true,
  },
  {
    id: "s-laptop",
    createdAt: "2026-10-20T07:40:00.000Z",
    lastSeenAt: "2026-10-21T18:03:00.000Z",
    expiresAt: "2026-11-19T07:40:00.000Z",
    ip: "198.51.100.9",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    isCurrent: false,
  },
] satisfies SessionSource[]);

export const AUDIT_RESPONSE = json({
  data: [
    {
      id: "a-1",
      actor: "admin",
      action: "approval",
      projectName: "checkout-ui",
      testName: "checkout-flow",
      branchName: "main",
      targetType: "visual-test",
      targetId: "vt-1",
      metadata: { variant: "1920x1080 Chrome staging" },
      createdAt: "2026-10-22T10:41:00.000Z",
    },
    {
      id: "a-2",
      actor: "qa-team",
      action: "review.comment",
      projectName: "checkout-ui",
      testName: "checkout-flow",
      branchName: "main",
      targetType: "test",
      targetId: "vt-1",
      metadata: null,
      createdAt: "2026-10-22T09:17:00.000Z",
    },
    {
      id: "a-3",
      actor: "admin",
      action: "webhook.update",
      projectName: "checkout-ui",
      testName: null,
      branchName: null,
      targetType: "webhook",
      targetId: "wh-1",
      metadata: { active: true },
      createdAt: "2026-10-21T16:02:00.000Z",
    },
  ],
  meta: { ...META },
} satisfies AuditControllerListResponses[200]);

export const RUNS_RESPONSE = json({
  data: [
    {
      id: "run-1",
      key: "ci-1042",
      branchName: "main",
      commitSha: "9f2c8b71d4e5a0c6f3b8d1e4a7c0b5f2d8e1a4c7",
      commitMessage: "Rebuild checkout summary card",
      ciUrl: "https://ci.example.com/pipeline/1042",
      createdAt: "2026-10-22T08:30:00.000Z",
      lastActivityAt: "2026-10-22T10:12:00.000Z",
      finishedAt: null,
      finishedBy: null,
    },
    {
      id: "run-2",
      key: "ci-1039",
      branchName: "release/2.4",
      commitSha: "1b7d4f9a2c6e8b0d3f5a7c9e1b3d5f7a9c1e3b5d",
      commitMessage: "Bump invoice template",
      ciUrl: null,
      createdAt: "2026-10-20T13:05:00.000Z",
      lastActivityAt: "2026-10-21T09:44:00.000Z",
      finishedAt: "2026-10-21T09:50:00.000Z",
      finishedBy: "admin",
    },
  ] satisfies RunSource[],
  // RunSource widens the free-form nullable columns (commitSha, ciUrl, ...) and
  // is therefore not assignable back to RunDto, so the envelope is checked
  // field by field: the array above against the mapper's source type, the meta
  // against PaginationMetaDto.
  meta: { ...META, total: 2 } satisfies PaginationMetaDto,
});

export const TRENDS_RESPONSE = json({
  from: "2026-10-09T00:00:00.000Z",
  to: "2026-10-22T00:00:00.000Z",
  days: 14,
  daily: [
    { date: "2026-10-09", changed: 4, unchanged: 11, withinThreshold: 2 },
    { date: "2026-10-10", changed: 2, unchanged: 9, withinThreshold: 1 },
    { date: "2026-10-11", changed: 6, unchanged: 14, withinThreshold: 3 },
    { date: "2026-10-12", changed: 1, unchanged: 7, withinThreshold: 0 },
    { date: "2026-10-13", changed: 5, unchanged: 12, withinThreshold: 2 },
    { date: "2026-10-14", changed: 3, unchanged: 8, withinThreshold: 1 },
    { date: "2026-10-15", changed: 7, unchanged: 16, withinThreshold: 4 },
    { date: "2026-10-16", changed: 2, unchanged: 10, withinThreshold: 1 },
    { date: "2026-10-17", changed: 4, unchanged: 13, withinThreshold: 2 },
    { date: "2026-10-18", changed: 1, unchanged: 6, withinThreshold: 0 },
    { date: "2026-10-19", changed: 5, unchanged: 15, withinThreshold: 3 },
    { date: "2026-10-20", changed: 3, unchanged: 9, withinThreshold: 1 },
    { date: "2026-10-21", changed: 6, unchanged: 17, withinThreshold: 2 },
    { date: "2026-10-22", changed: 2, unchanged: 11, withinThreshold: 1 },
  ],
  pendingReview: { count: 12, avgSeconds: 5400, maxSeconds: 172800 },
  approvalLatency: { count: 34, avgSeconds: 7200 },
  flakeRate: { flakyTests: 3, totalTests: 48, rate: 0.0625 },
} satisfies TrendsControllerGetResponses[200]);

// The public share page in its TEST scope — the case that shows pixels, which
// is the point of a share link. The resolve endpoint answers a free-form nested
// payload, so the fixture is bound to the mapper's own source type; the three
// images reuse the demo pair the review page renders.
export const PUBLIC_SHARE_TEST_RESPONSE = json({
  scope: "TEST",
  projectName: "checkout-ui",
  testName: "checkout-flow",
  branchName: "main",
  runKey: null,
  expiresAt: "2026-10-29T12:00:00.000Z",
  project: { name: "checkout-ui" },
  test: {
    name: "checkout-flow",
    kind: "image",
    status: "PENDING_APPROVAL",
    branchName: "main",
    variantCount: 6,
  },
  comparison: {
    id: "cmp-share-1",
    status: "PENDING_APPROVAL",
    kind: "image",
    mismatchPixelCount: 26460,
    mismatchPageCount: null,
    pageCount: null,
    viewport: "1920x1080",
    browser: "Chrome",
    environment: "staging",
    baselineUrl: DEMO_BASELINE,
    candidateUrl: DEMO_CANDIDATE,
    diffUrl: DEMO_DIFF,
  },
} satisfies PublicShareSource);

// The invite page in its pending state: the account the link belongs to, the
// expiry, and the one reveal button the whole page exists for. The password is
// not part of the preview — it only exists in the reveal answer.
export const PUBLIC_INVITE_PREVIEW_RESPONSE = json({
  username: "dana.qa",
  role: "MEMBER",
  expiresAt: "2026-11-16T12:00:00.000Z",
  status: "pending",
} satisfies InvitePreviewDto);

// One run that ended badly: a failed job, two pending comparisons (one muted, so
// the counts explain what holds the gate) and one recorded approval. The state is
// terminal on purpose — a live one would start the status poll under the shot.
export const RUN_DETAIL_RESPONSE = json({
  run: {
    id: "run-1",
    key: "ci-1042",
    branchName: "main",
    commitSha: "9f2c8b71d4e5a0c6f3b8d1e4a7c0b5f2d8e1a4c7",
    commitMessage: "Rebuild checkout summary card",
    ciUrl: "https://ci.example.com/pipeline/1042",
    createdAt: "2026-10-22T08:30:00.000Z",
    lastActivityAt: "2026-10-22T10:12:00.000Z",
    finishedAt: "2026-10-22T11:05:00.000Z",
    finishedBy: "admin",
  } satisfies RunSource,
  status: {
    state: "failed",
    pendingComparisons: 2,
    mutedPending: 1,
    pendingJobs: 0,
    failedJobs: 1,
    approved: 3,
    testCount: 6,
  } satisfies RunStatusDto,
  pending: [
    {
      comparisonId: "cmp-run-1",
      testName: "checkout-flow",
      kind: "image",
      branchName: "main",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      mismatchPixelCount: 26460,
      mismatchPageCount: null,
      muted: false,
      createdAt: "2026-10-22T09:40:00.000Z",
    },
    {
      comparisonId: "cmp-run-2",
      testName: "cart-summary",
      kind: "image",
      branchName: "main",
      variant: {
        viewport: "1366x768",
        browser: "Firefox",
        environment: "staging",
      },
      mismatchPixelCount: 157,
      mismatchPageCount: null,
      muted: true,
      createdAt: "2026-10-22T09:52:00.000Z",
    },
  ] satisfies RunPendingDto[],
  approvals: [
    {
      comparisonId: "cmp-run-0",
      testName: "login-form",
      approvedBy: "jane.doe",
      approvedAt: "2026-10-22T10:20:00.000Z",
    },
  ] satisfies RunApprovalDto[],
  uploads: [
    {
      testName: "checkout-flow",
      kind: "image",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      outcome: "COMPARISON_QUEUED",
      createdAt: "2026-10-22T09:38:00.000Z",
    },
    {
      testName: "login-form",
      kind: "image",
      variant: {
        viewport: "1920x1080",
        browser: "Chrome",
        environment: "staging",
      },
      outcome: "BASELINE_CREATED",
      createdAt: "2026-10-22T09:12:00.000Z",
    },
  ] satisfies RunUploadDto[],
  failedJobs: [
    {
      id: "job-1",
      testName: "payment-form",
      branchName: "main",
      error: "QUOTA_EXCEEDED: the project storage quota is exhausted",
      createdAt: "2026-10-22T09:58:00.000Z",
    },
  ] satisfies RunFailedJobDto[],
});
