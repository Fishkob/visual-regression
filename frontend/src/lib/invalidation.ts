import type { QueryClient } from "@tanstack/vue-query";
import { branchQueryKeys } from "@/domains/branches/query-keys";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import { groupQueryKeys } from "@/domains/groups/query-keys";
import {
  pendingTestQueryKeys,
  reviewInboxQueryKeys,
} from "@/domains/pending-tests/query-keys";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
import { approvalQueryKeys } from "@/domains/approvals/query-keys";
import { baselineHistoryQueryKeys } from "@/domains/baseline-history/query-keys";
import type { TestDetailsArgs } from "@/lib/variant-key";

export function invalidateProjectDetail(
  client: QueryClient,
  projectName: string,
) {
  client.invalidateQueries({ queryKey: projectQueryKeys.detail(projectName) });
  client.invalidateQueries({
    queryKey: pendingTestQueryKeys.list(projectName),
  });
}

// Single home for "invalidating the reviewable-details query for one test". The
// per-kind detail query keys are the only variance, so the invalidation rule
// (details query + the project/pending list that the directory renders) is one
// function parameterized by the key builder instead of two near-identical twins.
// The identity tuple is the one variant-key owns.
function invalidateTestDetails(
  client: QueryClient,
  args: TestDetailsArgs,
  keyOf: (args: TestDetailsArgs) => readonly unknown[],
) {
  client.invalidateQueries({ queryKey: keyOf(args) });
  invalidateProjectDetail(client, args.projectName);
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
  // An approval pins the variant and can change a branch's pending/test counts.
  client.invalidateQueries({ queryKey: branchQueryKeys.all() });
  // The approval trail is the badge next to the header: an approve appends a row
  // to it, so the reviewable-details read and the trail are refreshed together.
  client.invalidateQueries({ queryKey: approvalQueryKeys.all() });
  invalidateReviewInbox(client);
}

export function invalidateVisualTestDetails(
  client: QueryClient,
  args: TestDetailsArgs,
) {
  invalidateTestDetails(client, args, visualTestQueryKeys.details);
  // The gallery renders the comparison the detail panel shows, so an approval
  // changes a tile (status, candidate image) in the same breath.
  client.invalidateQueries({ queryKey: visualTestQueryKeys.variantsAll() });
}

export function invalidatePdfTestDetails(
  client: QueryClient,
  args: TestDetailsArgs,
) {
  invalidateTestDetails(client, args, pdfTestQueryKeys.details);
}

export function invalidateBaselineHistory(client: QueryClient) {
  client.invalidateQueries({ queryKey: baselineHistoryQueryKeys.all() });
}

// A restore is a baseline write on whichever kind owns the test. The history
// panel and its mutation do not know the kind, so both details namespaces are
// refreshed (the non-owning one has no matching key); each of them already
// fans out to the project, pending, branch, approval and inbox keys a baseline
// write touches. The history read is refreshed too: the restore itself records
// the replaced baseline as a new revision.
export function invalidateAfterBaselineRestore(
  client: QueryClient,
  args: TestDetailsArgs,
) {
  invalidateVisualTestDetails(client, args);
  invalidatePdfTestDetails(client, args);
  invalidateBaselineHistory(client);
}

export function invalidateProjectList(client: QueryClient) {
  // all() prefix-matches withPending() and every project detail key.
  client.invalidateQueries({ queryKey: projectQueryKeys.all() });
  invalidateReviewInbox(client);
}

export function invalidateReviewInbox(client: QueryClient) {
  client.invalidateQueries({ queryKey: reviewInboxQueryKeys.all() });
}

export function invalidateProjectsForGroupChange(client: QueryClient) {
  client.invalidateQueries({ queryKey: groupQueryKeys.all() });
  invalidateProjectList(client);
}
