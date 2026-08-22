import type { QueryClient } from "@tanstack/vue-query";
import { projectQueryKeys } from "@/domains/projects/query-keys";
import { pendingTestQueryKeys } from "@/domains/pending-tests/query-keys";
import { visualTestQueryKeys } from "@/domains/visual-test/query-keys";
import { pdfTestQueryKeys } from "@/domains/pdf-test/query-keys";
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
}

export function invalidateVisualTestDetails(
  client: QueryClient,
  args: TestDetailsArgs,
) {
  invalidateTestDetails(client, args, ({ projectName, testName, ...v }) =>
    visualTestQueryKeys.details({ projectName, testName, ...v }),
  );
}

export function invalidatePdfTestDetails(
  client: QueryClient,
  args: TestDetailsArgs,
) {
  invalidateTestDetails(
    client,
    args,
    ({ projectName, testName, viewport, browser, environment }) =>
      pdfTestQueryKeys.details(projectName, testName, {
        viewport,
        browser,
        environment,
      }),
  );
}

export function invalidateProjectList(client: QueryClient) {
  client.invalidateQueries({ queryKey: projectQueryKeys.all() });
  client.invalidateQueries({ queryKey: projectQueryKeys.withPending() });
}
