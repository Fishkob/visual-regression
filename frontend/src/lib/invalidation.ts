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
import { webhookQueryKeys } from "@/domains/webhooks/query-keys";
import { runsQueryKeys } from "@/domains/runs/query-keys";
import { testMetadataQueryKeys } from "@/domains/test-lifecycle/query-keys";
import { storageQueryKeys } from "@/domains/storage/query-keys";
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

// An endpoint write (create/update/delete) changes the row list, and a test or
// rotated secret changes what the delivery log will show next — so both reads
// age out together. The per-endpoint delivery prefix covers every endpoint.
export function invalidateWebhooks(client: QueryClient, projectName: string) {
  client.invalidateQueries({ queryKey: webhookQueryKeys.list(projectName) });
  client.invalidateQueries({
    queryKey: webhookQueryKeys.deliveriesAll(projectName),
  });
}

// A replay requeues one row: the log of that endpoint is the only read that
// moves, so the list is left alone.
export function invalidateWebhookDeliveries(
  client: QueryClient,
  projectName: string,
  endpointId: string,
) {
  client.invalidateQueries({
    queryKey: webhookQueryKeys.deliveries(projectName, endpointId),
  });
}

// A finish is a metadata write: the run row and its derived status change, and
// the list's finished column with them. Every branch/page list entry of the
// project hangs off the project prefix.
export function invalidateRun(
  client: QueryClient,
  projectName: string,
  runKey: string,
) {
  client.invalidateQueries({ queryKey: runsQueryKeys.list(projectName) });
  client.invalidateQueries({
    queryKey: runsQueryKeys.detail(projectName, runKey),
  });
  client.invalidateQueries({
    queryKey: runsQueryKeys.status(projectName, runKey),
  });
}

// Approve-all is a batch approval over the run's comparisons, so every read that
// shows a status, a queue, a baseline or a trail is stale afterwards — the same
// fan-out as the per-test bulk approval, plus the run the batch belongs to.
export function invalidateAfterRunApproveAll(
  client: QueryClient,
  projectName: string,
  runKey: string,
) {
  invalidateRun(client, projectName, runKey);
  invalidateProjectDetail(client, projectName);
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
  client.invalidateQueries({ queryKey: branchQueryKeys.all() });
  client.invalidateQueries({ queryKey: approvalQueryKeys.all() });
  client.invalidateQueries({ queryKey: visualTestQueryKeys.variantsAll() });
  client.invalidateQueries({ queryKey: pdfTestQueryKeys.all() });
  invalidateReviewInbox(client);
}

// A bulk approval from the inbox is the per-test bulk approval repeated across
// tests/projects: every read that shows a status, a queue, a baseline, a trail
// or a run's derived counts is stale afterwards. There is no single project or
// test to scope the keys to, so the whole read families are refreshed.
export function invalidateAfterBulkApprove(client: QueryClient) {
  client.invalidateQueries({ queryKey: visualTestQueryKeys.all() });
  client.invalidateQueries({ queryKey: pdfTestQueryKeys.all() });
  client.invalidateQueries({ queryKey: projectQueryKeys.all() });
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
  client.invalidateQueries({ queryKey: pendingTestQueryKeys.all() });
  client.invalidateQueries({ queryKey: reviewInboxQueryKeys.all() });
  client.invalidateQueries({ queryKey: branchQueryKeys.all() });
  client.invalidateQueries({ queryKey: approvalQueryKeys.all() });
  client.invalidateQueries({ queryKey: runsQueryKeys.all() });
}

// Moving projects between groups changes each project's group name (and the
// inbox's group sections), but not the groups themselves.
export function invalidateAfterBulkMove(client: QueryClient) {
  client.invalidateQueries({ queryKey: projectQueryKeys.all() });
  client.invalidateQueries({ queryKey: groupQueryKeys.all() });
  invalidateReviewInbox(client);
}

// Renaming, re-tagging or muting a test changes the test's metadata, the inbox
// rows (muted tests leave the queue) and the project/branch counts that mirror
// the pending set. The metadata read itself is refreshed through the same
// fan-out; the test-name routes re-fetch under their new key after navigation.
export function invalidateAfterTestMetadataChange(client: QueryClient) {
  client.invalidateQueries({ queryKey: testMetadataQueryKeys.all() });
  client.invalidateQueries({ queryKey: reviewInboxQueryKeys.all() });
  client.invalidateQueries({ queryKey: pendingTestQueryKeys.all() });
  client.invalidateQueries({ queryKey: projectQueryKeys.all() });
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
  client.invalidateQueries({ queryKey: branchQueryKeys.all() });
}

// A retention/quota update changes the storage read (the server echoes the
// normalized values) and nothing else.
export function invalidateProjectStorage(
  client: QueryClient,
  projectName: string,
) {
  client.invalidateQueries({ queryKey: storageQueryKeys.detail(projectName) });
}
