import { computed, unref } from "vue";
import { testCommandsControllerDeleteVisualTest } from "@sdk";
import type { VisualTestItem } from "@/domains/projects/project.model";
import {
  invalidateProjectDetail,
  invalidateProjectList,
} from "@/lib/invalidation";
import {
  formatVariantLabel,
  formatVariantLabelWithName,
} from "@/lib/format-variant-label";
import { useEntityDeleteMutation } from "@/composables/useEntityDeleteMutation";
import type { MaybeRef } from "@/composables/useDomainQuery";

export interface DeleteOptions {
  projectName: string;
  branchName?: MaybeRef<string | undefined>;
}

export type DeleteVisualTestArgs = {
  testName: string;
  viewport?: string;
  browser?: string;
  environment?: string;
};

export function useVisualTestDelete(options: DeleteOptions) {
  const { projectName, branchName } = options;

  const {
    pendingEntity: pendingVariant,
    showConfirm,
    deleting,
    requestDelete,
    confirmDelete,
    cancelDelete,
  } = useEntityDeleteMutation<VisualTestItem, DeleteVisualTestArgs>({
    mutationFn: (args) => {
      const branch = unref(branchName);
      return testCommandsControllerDeleteVisualTest({
        path: { projectName, testName: args.testName },
        query: {
          viewport: args.viewport,
          browser: args.browser,
          environment: args.environment,
          ...(branch ? { branch } : {}),
        },
      });
    },

    argsOf: (test) => ({
      testName: test.name ?? "",
      viewport: test.viewport,
      browser: test.browser,
      environment: test.environment,
    }),

    successMessage: ({ testName, viewport, browser, environment }) =>
      `Deleted ${formatVariantLabel({ viewport, browser, environment }) || "entire test"} of "${testName}"`,

    errorMessage: "Could not delete test or variant",

    invalidate: (client) => {
      invalidateProjectDetail(client, projectName);
      invalidateProjectList(client);
    },
  });

  const variantLabel = computed(() => {
    const v = pendingVariant.value;
    if (!v || !v.name) return "";
    return formatVariantLabelWithName(v.name, v);
  });

  return {
    showConfirm,
    pendingVariant,
    variantLabel,
    deleting,
    requestDelete,
    confirmDelete,
    cancelDelete,
  };
}
