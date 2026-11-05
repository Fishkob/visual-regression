import { describe, expect, it } from "vitest";

import { ComparisonStatus, TestStatus } from "@sdk";
import type { ApiKeysControllerCreateResponses } from "@sdk/models/ApiKeysControllerCreateResponses.gen";
import type { ApiKeysControllerFindAllResponses } from "@sdk/models/ApiKeysControllerFindAllResponses.gen";
import type { BranchesControllerListResponses } from "@sdk/models/BranchesControllerListResponses.gen";
import type { PdfControllerGetPdfTestDetailsResponses } from "@sdk/models/PdfControllerGetPdfTestDetailsResponses.gen";
import type { PendingTestDto } from "@sdk/models/PendingTestDto.gen";
import type { ProjectGroupsControllerFindAllResponses } from "@sdk/models/ProjectGroupsControllerFindAllResponses.gen";
import type { ProjectsControllerGetOneProjectResponses } from "@sdk/models/ProjectsControllerGetOneProjectResponses.gen";
import type { ProjectsControllerGetProjectsWithPendingFlagResponses } from "@sdk/models/ProjectsControllerGetProjectsWithPendingFlagResponses.gen";
import type { PublicShareControllerResolveResponses } from "@sdk/models/PublicShareControllerResolveResponses.gen";
import type { RunsControllerDetailResponses } from "@sdk/models/RunsControllerDetailResponses.gen";
import type { ReviewInboxControllerGetPendingResponses } from "@sdk/models/ReviewInboxControllerGetPendingResponses.gen";
import type { StorageControllerGetResponses } from "@sdk/models/StorageControllerGetResponses.gen";
import type { TestVariantsDto } from "@sdk/models/TestVariantsDto.gen";
import type { TestsQueriesControllerGetTestsWithPendingStatusResponses } from "@sdk/models/TestsQueriesControllerGetTestsWithPendingStatusResponses.gen";
import type { TestsQueriesControllerGetVariantsResponses } from "@sdk/models/TestsQueriesControllerGetVariantsResponses.gen";
import type { TestsQueriesControllerGetVisualTestDetailsResponses } from "@sdk/models/TestsQueriesControllerGetVisualTestDetailsResponses.gen";
import type { WebhooksControllerListResponses } from "@sdk/models/WebhooksControllerListResponses.gen";
import type { BaselineRevisionSource } from "@/domains/baseline-history/baseline-history.mapper";

import {
  API_KEYS_EMPTY_RESPONSE,
  API_KEYS_RESPONSE,
  CREATED_API_KEY_RESPONSE,
} from "../../tests/ct/mocks/apiKeys.mocks";
import {
  PDF_BASELINE_HISTORY,
  VISUAL_BASELINE_HISTORY,
} from "../../tests/ct/mocks/baselineHistory.mocks";
import {
  GROUPS_EMPTY_RESPONSE,
  GROUPS_RESPONSE,
} from "../../tests/ct/mocks/groups.mocks";
import {
  PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT,
  PDF_TEST_DETAILS_EMPTY,
} from "../../tests/ct/mocks/pdfTest.mocks";
import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_BRANCH_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECT_EMPTY_RESPONSE,
  PROJECTS_PENDING_EMPTY_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
  REVIEW_INBOX_BRANCHES_RESPONSE,
  REVIEW_INBOX_EMPTY_RESPONSE,
  REVIEW_INBOX_MULTI_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "../../tests/ct/mocks/projects.mocks";
import {
  makePdfReviewableDetails,
  makePendingItem,
  makeReviewableDetails,
  makeReviewableDetailsWithRegions,
} from "../../tests/ct/mocks/reviewLoop.mocks";
import {
  PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE,
  VISUAL_TEST_DETAILS_PENDING,
  VISUAL_TEST_DETAILS_WITH_REGIONS,
  VISUAL_TEST_PENDING_META,
  VISUAL_TEST_VARIANTS,
  VISUAL_TEST_VARIANTS_BROWSERS,
  VISUAL_TEST_VARIANTS_BROWSERS_DEMO,
  VISUAL_TEST_VARIANTS_DEMO,
  VISUAL_TEST_VARIANTS_SINGLE,
} from "../../tests/ct/mocks/visualTest.mocks";
import { WEBHOOKS_RESPONSE } from "../../tests/ct/mocks/webhooks.mocks";
import {
  PUBLIC_SHARE_TEST_RESPONSE,
  RUN_DETAIL_RESPONSE,
} from "../../tests/quality/mocks/pages.mocks";
import { PROJECT_STORAGE_RESPONSE } from "../../tests/quality/cases";

// `FulfillResponse.body` is a string, so `JSON.parse` alone cannot tie a fixture
// to the API: the compile-time gate is the `satisfies <GeneratedResponse>[status]`
// on each fixture literal in tests/ct/mocks, which makes a renamed, added or
// retyped DTO property fail `pnpm typecheck` where the fixture is written. These
// tests re-parse the serialized body, bind it to that same generated type and
// assert the runtime shape the browser suites actually serve.
function parse<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

function expectVariantGallery(body: TestVariantsDto): void {
  expect(body.name).toBe("checkout-flow");
  expect(body.kind).toBe("image");
  expect(body.variants.length).toBeGreaterThan(0);
  for (const variant of body.variants) {
    expect(Object.values(TestStatus)).toContain(variant.status);
    expect(variant.viewport).toMatch(/^\d+x\d+$/);
    expect(variant).toHaveProperty("signedBaselineUrl");
    expect(variant).toHaveProperty("signedCandidateUrl");
  }
}

describe("project fixtures", () => {
  it("binds the pending-project list to ProjectDto", () => {
    const body = parse<
      ProjectsControllerGetProjectsWithPendingFlagResponses[200]
    >(PROJECTS_PENDING_RESPONSE);
    expect(body.data?.length).toBeGreaterThan(0);
    expect(body.meta?.total).toBe(body.data?.length);
    for (const project of body.data ?? []) {
      expect(typeof project.id).toBe("string");
      expect(typeof project.pending).toBe("boolean");
    }
  });

  it("binds the empty pending-project list to ProjectDto", () => {
    const body = parse<
      ProjectsControllerGetProjectsWithPendingFlagResponses[200]
    >(PROJECTS_PENDING_EMPTY_RESPONSE);
    expect(body.data).toEqual([]);
    expect(body.meta?.total).toBe(0);
  });

  it("binds the project detail to ProjectDto", () => {
    const body = parse<ProjectsControllerGetOneProjectResponses[200]>(
      PROJECT_CHECKOUT_UI_RESPONSE,
    );
    expect(body.name).toBe("checkout-ui");
    expect(body.visualTests?.length).toBeGreaterThan(0);
    for (const test of body.visualTests ?? []) {
      expect(test.variant).toBeDefined();
      if (test.latestStatus !== undefined) {
        expect(Object.values(TestStatus)).toContain(test.latestStatus);
      }
    }
  });

  it("binds the branch-scoped project detail to ProjectDto", () => {
    const body = parse<ProjectsControllerGetOneProjectResponses[200]>(
      PROJECT_CHECKOUT_UI_BRANCH_RESPONSE,
    );
    const [own, inherited] = body.visualTests ?? [];
    expect(own?.origin).toBe("branch");
    expect(inherited?.origin).toBe("inherited");
    expect(inherited?.inheritedFrom).toBe("main");
  });

  it("binds the baseline-less project detail to ProjectDto", () => {
    const body = parse<ProjectsControllerGetOneProjectResponses[200]>(
      PROJECT_EMPTY_RESPONSE,
    );
    expect(body.visualTests).toEqual([]);
  });

  it("binds the storage aggregate to StorageUsageDto", () => {
    const body = parse<StorageControllerGetResponses[200]>(
      PROJECT_STORAGE_RESPONSE,
    );
    expect(typeof body.usageBytes).toBe("string");
    expect(body.percent).toBeGreaterThanOrEqual(0);
    expect(body.percent).toBeLessThanOrEqual(100);
  });
});

describe("review inbox fixtures", () => {
  it.each([
    ["REVIEW_INBOX_RESPONSE", REVIEW_INBOX_RESPONSE],
    ["REVIEW_INBOX_MULTI_RESPONSE", REVIEW_INBOX_MULTI_RESPONSE],
    ["REVIEW_INBOX_BRANCHES_RESPONSE", REVIEW_INBOX_BRANCHES_RESPONSE],
  ])("binds %s to PendingReviewDto", (_name, response) => {
    const body = parse<ReviewInboxControllerGetPendingResponses[200]>(response);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.meta.total).toBe(body.data.length);
    for (const row of body.data) {
      expect(typeof row.comparisonId).toBe("string");
      expect(typeof row.projectName).toBe("string");
      expect(["image", "pdf"]).toContain(row.kind);
      expect(row.variant.viewport).toMatch(/^\d+x\d+$/);
      expect(row.projectPendingCount).toBeGreaterThan(0);
    }
  });

  it("binds the empty inbox to PendingReviewDto", () => {
    const body = parse<ReviewInboxControllerGetPendingResponses[200]>(
      REVIEW_INBOX_EMPTY_RESPONSE,
    );
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it("binds the branch list to BranchSummaryDto", () => {
    const body = parse<BranchesControllerListResponses[200]>(BRANCHES_RESPONSE);
    expect(body.map((branch) => branch.name)).toContain("main");
    for (const branch of body) {
      expect(typeof branch.isDefault).toBe("boolean");
      expect(typeof branch.pendingCount).toBe("number");
    }
  });
});

describe("groups fixtures", () => {
  it("binds the group list to ProjectGroupDto", () => {
    const body =
      parse<ProjectGroupsControllerFindAllResponses[200]>(GROUPS_RESPONSE);
    expect(body.length).toBeGreaterThan(0);
    for (const group of body) {
      expect(typeof group.id).toBe("string");
      expect(typeof group.projectCount).toBe("number");
    }
  });

  it("binds the empty group list to ProjectGroupDto", () => {
    const body = parse<ProjectGroupsControllerFindAllResponses[200]>(
      GROUPS_EMPTY_RESPONSE,
    );
    expect(body).toEqual([]);
  });
});

describe("api key fixtures", () => {
  it("binds the api key list to ApiKeyDto", () => {
    const body =
      parse<ApiKeysControllerFindAllResponses[200]>(API_KEYS_RESPONSE);
    expect(body.length).toBeGreaterThan(0);
    for (const key of body) {
      expect(typeof key.id).toBe("string");
      expect(["active", "revoked", "expired"]).toContain(key.status);
      expect(Array.isArray(key.scopes)).toBe(true);
    }
  });

  it("binds the empty api key list to ApiKeyDto", () => {
    const body = parse<ApiKeysControllerFindAllResponses[200]>(
      API_KEYS_EMPTY_RESPONSE,
    );
    expect(body).toEqual([]);
  });

  it("binds the created api key to CreatedApiKeyDto", () => {
    const body = parse<ApiKeysControllerCreateResponses[201]>(
      CREATED_API_KEY_RESPONSE,
    );
    expect(typeof body.rawKey).toBe("string");
    expect(typeof body.keyHint).toBe("string");
  });
});

describe("webhook fixtures", () => {
  it("binds the webhook list to WebhookEndpointDto", () => {
    const body = parse<WebhooksControllerListResponses[200]>(WEBHOOKS_RESPONSE);
    expect(body.length).toBeGreaterThan(0);
    for (const endpoint of body) {
      expect(["json", "slack"]).toContain(endpoint.format);
      expect(Array.isArray(endpoint.events)).toBe(true);
    }
  });
});

describe("pdf test details fixtures", () => {
  it("binds a pdf test without baseline to PdfTestDetailsDto", () => {
    const body = parse<PdfControllerGetPdfTestDetailsResponses[200]>(
      PDF_TEST_DETAILS_EMPTY,
    );
    expect(body.kind).toBe("pdf");
    expect(["branch", "inherited"]).toContain(body.origin);
    expect(typeof body.baselineInherited).toBe("boolean");
    expect(body.baseline).toBeNull();
  });

  it("binds a pdf baseline without a page count to PdfTestDetailsDto", () => {
    const body = parse<PdfControllerGetPdfTestDetailsResponses[200]>(
      PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT,
    );
    expect(body.baseline?.pageCount).toBeNull();
    expect(body.comparison).toBeNull();
  });

  it("binds a pending pdf review to PdfTestDetailsDto", () => {
    const body = parse<PdfControllerGetPdfTestDetailsResponses[200]>(
      makePdfReviewableDetails("invoice"),
    );
    expect(body.kind).toBe("pdf");
    expect(body.origin).toBe("branch");
    expect(body.baseline?.pageCount).toBe(3);
    expect(body.comparison?.status).toBe(ComparisonStatus.PENDING_APPROVAL);
  });
});

describe("baseline history fixtures", () => {
  // BaselineRevisionDto types `pageCount`/`createdBy` as free-form objects
  // because the backend declares them nullable but untyped; the wire carries
  // number | string. `BaselineRevisionSource` is the same normalization the
  // panel's mapper applies (see baseline-history.mapper.ts), so the rest of the
  // revision is still checked against the generated DTO.
  it("binds the visual baseline history to BaselineRevisionDto", () => {
    const body = parse<BaselineRevisionSource[]>(VISUAL_BASELINE_HISTORY);
    expect(body.length).toBeGreaterThan(0);
    for (const revision of body) {
      expect(["approval", "restore", "import"]).toContain(revision.reason);
      expect(revision.signedImageUrl).toBeTruthy();
    }
    expect(body[0]?.pageCount).toBeNull();
    expect(body[0]?.createdBy).toBe("jane.doe");
    expect(body[1]?.createdBy).toBeNull();
  });

  it("binds the pdf baseline history to BaselineRevisionDto", () => {
    const body = parse<BaselineRevisionSource[]>(PDF_BASELINE_HISTORY);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]?.pageCount).toBe(3);
    expect(body[1]?.pageCount).toBeNull();
    expect(body[1]?.createdBy).toBeNull();
  });
});

describe("visual test details fixtures", () => {
  it.each([
    ["VISUAL_TEST_DETAILS_PENDING", VISUAL_TEST_DETAILS_PENDING],
    ["VISUAL_TEST_DETAILS_WITH_REGIONS", VISUAL_TEST_DETAILS_WITH_REGIONS],
    [
      "PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE",
      PROJECT_TEST_DETAILS_ONLY_BASELINE_RESPONSE,
    ],
    ["makeReviewableDetails", makeReviewableDetails("checkout-flow")],
    [
      "makeReviewableDetailsWithRegions",
      makeReviewableDetailsWithRegions("checkout-flow", [
        { x: 220, y: 176, width: 134, height: 210, pixelCount: 26460 },
      ]),
    ],
  ])("binds %s to VisualTestDetailsDto", (_name, response) => {
    const body =
      parse<TestsQueriesControllerGetVisualTestDetailsResponses[200]>(response);
    expect(body.name).toBe("checkout-flow");
    if (body.baseline !== undefined) {
      expect(body.baseline.type).toBe("BASELINE");
    }
    if (body.comparison !== undefined) {
      expect(Object.values(ComparisonStatus)).toContain(body.comparison.status);
      expect(body.comparison.candidate?.type).toBe("CURRENT");
    }
  });

  it("binds the changed regions a review page marks", () => {
    const body = parse<
      TestsQueriesControllerGetVisualTestDetailsResponses[200]
    >(VISUAL_TEST_DETAILS_WITH_REGIONS);
    expect(body.comparison?.changedRegions).toHaveLength(2);
    for (const region of body.comparison?.changedRegions ?? []) {
      expect(region.width).toBeGreaterThan(0);
      expect(region.pixelCount).toBeGreaterThan(0);
    }
  });

  it("binds the pending meta list to PendingTestDto", () => {
    const body = parse<
      TestsQueriesControllerGetTestsWithPendingStatusResponses[200]
    >(VISUAL_TEST_PENDING_META);
    expect(body.meta.total).toBe(body.data.length);
    for (const test of body.data) {
      expect(typeof test.name).toBe("string");
      expect(test.variant).toBeDefined();
    }
  });

  it("binds a pending review item to PendingTestDto", () => {
    const item: PendingTestDto = makePendingItem("login-form");
    expect(item.name).toBe("login-form");
    expect(item.variant).toBeDefined();
  });
});

describe("visual test variant fixtures", () => {
  it.each([
    ["VISUAL_TEST_VARIANTS", VISUAL_TEST_VARIANTS],
    ["VISUAL_TEST_VARIANTS_BROWSERS", VISUAL_TEST_VARIANTS_BROWSERS],
    ["VISUAL_TEST_VARIANTS_SINGLE", VISUAL_TEST_VARIANTS_SINGLE],
    ["VISUAL_TEST_VARIANTS_DEMO", VISUAL_TEST_VARIANTS_DEMO],
    ["VISUAL_TEST_VARIANTS_BROWSERS_DEMO", VISUAL_TEST_VARIANTS_BROWSERS_DEMO],
  ])("binds %s to TestVariantSummaryDto", (_name, response) => {
    expectVariantGallery(
      parse<TestsQueriesControllerGetVariantsResponses[200]>(response),
    );
  });
});

describe("run detail fixtures", () => {
  it("binds the run detail to RunDetailDto", () => {
    const body = parse<RunsControllerDetailResponses[200]>(RUN_DETAIL_RESPONSE);
    expect(body.run.key).toBe("ci-1042");
    expect(["open", "pending", "failed", "passed"]).toContain(
      body.status.state,
    );
    // The counts have to explain the gate: a muted pending comparison is still
    // counted, and only the difference may hold the run.
    expect(body.status.mutedPending).toBeLessThanOrEqual(
      body.status.pendingComparisons,
    );
    expect(body.pending.length).toBeGreaterThan(0);
    for (const row of body.pending) {
      expect(typeof row.comparisonId).toBe("string");
      expect(row.variant.viewport).toMatch(/^\d+x\d+$/);
      expect(typeof row.muted).toBe("boolean");
    }
    expect(body.failedJobs.length).toBeGreaterThan(0);
  });
});

describe("public share fixtures", () => {
  it("binds a shared test to PublicShareDto", () => {
    const body = parse<PublicShareControllerResolveResponses[200]>(
      PUBLIC_SHARE_TEST_RESPONSE,
    );
    expect(body.scope).toBe("TEST");
    expect(body.comparison?.baselineUrl).toBeTruthy();
    expect(body.comparison?.candidateUrl).toBeTruthy();
  });
});
