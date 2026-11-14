import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";

import * as invalidation from "@/lib/invalidation";

import { apiKeyQueryKeys } from "@/domains/api-keys/query-keys";
import { approvalQueryKeys } from "@/domains/approvals/query-keys";
import { assignmentQueryKeys } from "@/domains/assignments/query-keys";
import { auditQueryKeys } from "@/domains/audit/query-keys";
import { authQueryKeys } from "@/domains/auth/query-keys";
import { baselineHistoryQueryKeys } from "@/domains/baseline-history/query-keys";
import { branchQueryKeys } from "@/domains/branches/query-keys";
import { commentQueryKeys } from "@/domains/comments/query-keys";
import { groupQueryKeys } from "@/domains/groups/query-keys";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
import {
  pendingTestQueryKeys,
  reviewInboxQueryKeys,
} from "@/domains/pending-tests/query-keys";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import { runsQueryKeys } from "@/domains/runs/query-keys";
import { searchQueryKeys } from "@/domains/search/query-keys";
import { securityQueryKeys } from "@/domains/security/query-keys";
import { shareLinkQueryKeys } from "@/domains/share-links/query-keys";
import { storageQueryKeys } from "@/domains/storage/query-keys";
import { testKindQueryKeys } from "@/domains/test-kind/query-keys";
import { testMetadataQueryKeys } from "@/domains/test-lifecycle/query-keys";
import { trendsQueryKeys } from "@/domains/trends/query-keys";
import { userQueryKeys } from "@/domains/users/query-keys";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import { webhookQueryKeys } from "@/domains/webhooks/query-keys";

// The invalidation contract, asserted against a real cache instead of a spy.
//
// `invalidateQueries` matches by key *prefix*, so "which reads does this write
// refresh" is a property of the key builders, not of the call list. A test that
// counts calls or compares string literals stays green when a builder grows a
// segment, and says nothing about the reads it was supposed to cover — which is
// how the bulk-approve copy in `useBulkApprove` lost the run invalidation while
// its own test kept asserting "8 calls".
//
// Every row therefore names the reads it must cover and the reads it must leave
// alone, both built by the domain's own key builders, and the whole thing runs
// against a seeded QueryClient so the framework's real matching rule decides.
//
// Adding a helper to `src/lib/invalidation.ts` fails the last test until it has
// a row here.

type Key = readonly unknown[];

const PROJECT = "checkout-ui";
const TEST = "login";
const BRANCH = "main";
const RUN = "run-2026-11-13";
const ENDPOINT = "wh-7f3a";
const OTHER_ENDPOINT = "wh-91bc";
const VARIANT = {
  viewport: "1920x1080",
  browser: "chrome",
  environment: "staging",
};
const DETAILS = {
  projectName: PROJECT,
  testName: TEST,
  branch: BRANCH,
  ...VARIANT,
};

// One leaf key per read a `useQuery` can actually mount. Prefix builders
// (`all()`, `lists()`, `details()`) are deliberately absent: they are
// invalidation targets, never cache entries of their own.
const projectDetail = projectQueryKeys.detail(PROJECT, BRANCH);
const projectPage = projectQueryKeys.withPending({ page: 2, q: "check" });
const projectPicker = projectQueryKeys.allProjects();
const pendingList = pendingTestQueryKeys.list(PROJECT, BRANCH);
const inboxList = reviewInboxQueryKeys.list({ page: 2, groupId: "g-1" });
const inboxBranches = reviewInboxQueryKeys.branches();
const inboxCount = reviewInboxQueryKeys.count();
const visualDetails = visualTestQueryKeys.details(DETAILS);
const visualVariants = visualTestQueryKeys.variants({
  projectName: PROJECT,
  testName: TEST,
  branch: BRANCH,
});
const pdfDetails = pdfTestQueryKeys.details(DETAILS);
const pdfPage = pdfTestQueryKeys.renderPage(PROJECT, TEST, "http://s/a.pdf", 2);
const baselineHistory = baselineHistoryQueryKeys.forVariant(DETAILS);
const webhookList = webhookQueryKeys.list(PROJECT);
const webhookDeliveries = webhookQueryKeys.deliveries(PROJECT, ENDPOINT);
const otherWebhookDeliveries = webhookQueryKeys.deliveries(
  PROJECT,
  OTHER_ENDPOINT,
);
const runList = runsQueryKeys.list(PROJECT);
const runPage = runsQueryKeys.list(PROJECT, { page: 3 });
const runDetail = runsQueryKeys.detail(PROJECT, RUN, BRANCH);
const runStatus = runsQueryKeys.status(PROJECT, RUN, BRANCH);
const branchList = branchQueryKeys.list(PROJECT, false);
const groupList = groupQueryKeys.list();
const approvalsForTest = approvalQueryKeys.forTest({
  projectName: PROJECT,
  testName: TEST,
  branch: BRANCH,
});
const storageUsage = storageQueryKeys.detail(PROJECT);
const retentionPreview = storageQueryKeys.preview(PROJECT);
const myAssignments = assignmentQueryKeys.mine();
const searchHits = searchQueryKeys.query("check");
const testMetadata = testMetadataQueryKeys.detail(PROJECT, TEST, BRANCH);
const auditPage = auditQueryKeys.list({ page: 2 });
const securitySessions = securityQueryKeys.sessions();
const shareLinks = shareLinkQueryKeys.list(PROJECT);
const testKind = testKindQueryKeys.kind(PROJECT, TEST, BRANCH);
const apiKeys = apiKeyQueryKeys.list();
const users = userQueryKeys.list();
const me = authQueryKeys.me();
const comments = commentQueryKeys.list(PROJECT, TEST, { branch: BRANCH });
const trends = trendsQueryKeys.detail(PROJECT, 30);

const ALL_READS: Key[] = [
  projectDetail,
  projectPage,
  projectPicker,
  pendingList,
  inboxList,
  inboxBranches,
  inboxCount,
  visualDetails,
  visualVariants,
  pdfDetails,
  pdfPage,
  baselineHistory,
  webhookList,
  webhookDeliveries,
  otherWebhookDeliveries,
  runList,
  runPage,
  runDetail,
  runStatus,
  branchList,
  groupList,
  approvalsForTest,
  storageUsage,
  retentionPreview,
  myAssignments,
  searchHits,
  testMetadata,
  auditPage,
  securitySessions,
  shareLinks,
  testKind,
  apiKeys,
  users,
  me,
  comments,
  trends,
];

interface Contract {
  name: keyof typeof invalidation;
  run: (client: QueryClient) => void;
  /** Reads this write must refresh. */
  covers: Key[];
  /** Reads it must not touch — a scoped write is not a flush. */
  leaves: Key[];
}

const CONTRACTS: Contract[] = [
  {
    name: "invalidateProjectDetail",
    run: (client) => invalidation.invalidateProjectDetail(client, PROJECT),
    // Deliberately not the project list: `detail()` is its own key family, so a
    // write here refreshes one project's detail read and its pending list only.
    // Callers that move a count the *list* shows (an approval, a bulk delete, a
    // run approve-all) invalidate `withPending()` alongside — that split is the
    // reason a details write does not flush the directory.
    covers: [projectDetail, pendingList],
    leaves: [projectPage, projectPicker, inboxList, branchList, runList],
  },
  {
    name: "invalidateVisualTestDetails",
    run: (client) => invalidation.invalidateVisualTestDetails(client, DETAILS),
    covers: [
      visualDetails,
      visualVariants,
      projectDetail,
      pendingList,
      branchList,
      approvalsForTest,
      inboxList,
    ],
    leaves: [pdfDetails, pdfPage, runDetail, storageUsage, users],
  },
  {
    name: "invalidatePdfTestDetails",
    run: (client) => invalidation.invalidatePdfTestDetails(client, DETAILS),
    covers: [
      pdfDetails,
      projectDetail,
      pendingList,
      branchList,
      approvalsForTest,
      inboxList,
    ],
    leaves: [visualDetails, visualVariants, pdfPage, runDetail],
  },
  {
    name: "invalidateBaselineHistory",
    run: (client) => invalidation.invalidateBaselineHistory(client),
    covers: [baselineHistory],
    leaves: [projectDetail, visualDetails, inboxList],
  },
  {
    name: "invalidateAfterBaselineRestore",
    run: (client) =>
      invalidation.invalidateAfterBaselineRestore(client, DETAILS),
    covers: [
      visualDetails,
      pdfDetails,
      baselineHistory,
      projectDetail,
      pendingList,
      inboxList,
    ],
    leaves: [webhookList, storageUsage, runDetail, users],
  },
  {
    name: "invalidateProjectList",
    run: (client) => invalidation.invalidateProjectList(client),
    covers: [projectPage, projectDetail, projectPicker, inboxList],
    leaves: [branchList, approvalsForTest, visualDetails],
  },
  {
    name: "invalidateAfterBulkTestDelete",
    run: (client) =>
      invalidation.invalidateAfterBulkTestDelete(client, PROJECT),
    covers: [projectDetail, projectPage, pendingList, inboxList],
    leaves: [visualDetails, runDetail, storageUsage],
  },
  {
    name: "invalidateReviewInbox",
    run: (client) => invalidation.invalidateReviewInbox(client),
    covers: [inboxList, inboxBranches, inboxCount],
    leaves: [projectDetail, users, runDetail],
  },
  {
    name: "invalidateProjectsForGroupChange",
    run: (client) => invalidation.invalidateProjectsForGroupChange(client),
    covers: [groupList, projectPage, projectDetail, inboxList],
    leaves: [branchList, users, storageUsage],
  },
  {
    name: "invalidateWebhooks",
    run: (client) => invalidation.invalidateWebhooks(client, PROJECT),
    covers: [webhookList, webhookDeliveries, otherWebhookDeliveries],
    leaves: [projectDetail, storageUsage, inboxList],
  },
  {
    name: "invalidateWebhookDeliveries",
    run: (client) =>
      invalidation.invalidateWebhookDeliveries(client, PROJECT, ENDPOINT),
    covers: [webhookDeliveries],
    leaves: [webhookList, otherWebhookDeliveries],
  },
  {
    name: "invalidateRun",
    run: (client) => invalidation.invalidateRun(client, PROJECT, RUN),
    covers: [runList, runPage, runDetail, runStatus],
    leaves: [projectDetail, inboxList, visualDetails],
  },
  {
    name: "invalidateAfterRunApproveAll",
    run: (client) =>
      invalidation.invalidateAfterRunApproveAll(client, PROJECT, RUN),
    covers: [
      runList,
      runDetail,
      runStatus,
      projectDetail,
      pendingList,
      branchList,
      approvalsForTest,
      visualVariants,
      pdfDetails,
      inboxList,
    ],
    leaves: [storageUsage, webhookList, users, shareLinks],
  },
  {
    name: "invalidateAfterBulkApprove",
    run: (client) => invalidation.invalidateAfterBulkApprove(client),
    covers: [
      visualDetails,
      visualVariants,
      pdfDetails,
      projectDetail,
      projectPage,
      pendingList,
      inboxList,
      branchList,
      approvalsForTest,
      runList,
      runDetail,
      runStatus,
    ],
    leaves: [storageUsage, webhookList, shareLinks, auditPage],
  },
  {
    name: "invalidateAfterBulkMove",
    run: (client) => invalidation.invalidateAfterBulkMove(client),
    covers: [projectPage, projectDetail, groupList, inboxList],
    leaves: [branchList, runList, storageUsage],
  },
  {
    name: "invalidateAfterProjectRename",
    run: (client) => invalidation.invalidateAfterProjectRename(client),
    covers: [
      projectDetail,
      projectPage,
      pendingList,
      inboxList,
      myAssignments,
      searchHits,
      branchList,
      runList,
      storageUsage,
      webhookList,
      testMetadata,
      approvalsForTest,
      baselineHistory,
      visualDetails,
      pdfDetails,
    ],
    leaves: [apiKeys, users, securitySessions, me, auditPage],
  },
  {
    name: "invalidateAfterTestMetadataChange",
    run: (client) => invalidation.invalidateAfterTestMetadataChange(client),
    covers: [
      testMetadata,
      inboxList,
      pendingList,
      projectDetail,
      projectPage,
      branchList,
    ],
    leaves: [runList, storageUsage, webhookList, visualDetails],
  },
  {
    name: "invalidateProjectStorage",
    run: (client) => invalidation.invalidateProjectStorage(client, PROJECT),
    covers: [storageUsage, retentionPreview],
    leaves: [projectDetail, inboxList, branchList],
  },
];

function seededCache(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  for (const key of ALL_READS) {
    client.setQueryData(key, "cached");
  }
  return client;
}

function isInvalidated(client: QueryClient, key: Key): boolean {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  if (!query) {
    throw new Error(`no cache entry for ${JSON.stringify(key)}`);
  }
  return query.state.isInvalidated;
}

describe("invalidation contract", () => {
  it.each(CONTRACTS.map((contract) => [contract.name, contract] as const))(
    "%s refreshes exactly the reads it owns",
    (_name, contract) => {
      const client = seededCache();

      contract.run(client);

      const missed = contract.covers
        .filter((key) => !isInvalidated(client, key))
        .map((key) => JSON.stringify(key));
      const overreaching = contract.leaves
        .filter((key) => isInvalidated(client, key))
        .map((key) => JSON.stringify(key));

      expect({ missed, overreaching }).toEqual({
        missed: [],
        overreaching: [],
      });
    },
  );

  it("gives every exported helper a contract row", () => {
    const exported = Object.keys(invalidation).sort();
    const documented = CONTRACTS.map((contract) => contract.name).sort();

    expect(exported).toEqual(documented);
  });

  it("names every read it seeds with a distinct hash", () => {
    // Two entries that hash alike would make one row's assertion observe the
    // other's key, so the contract would pass or fail for the wrong reason.
    const hashes = ALL_READS.map((key) => JSON.stringify(key));

    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
