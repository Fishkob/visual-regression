import { computed } from "vue";
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

export interface DeleteOptions {
  projectName: string;
}

export type DeleteVisualTestArgs = {
  testName: string;
  viewport?: string;
  browser?: string;
  environment?: string;
};

export function useVisualTestDelete(options: DeleteOptions) {
  const { projectName } = options;

  const {
    pendingEntity: pendingVariant,
    showConfirm,
    deleting,
    requestDelete,
    confirmDelete,
    cancelDelete,
  } = useEntityDeleteMutation<VisualTestItem, DeleteVisualTestArgs>({
    mutationFn: (args) =>
      testCommandsControllerDeleteVisualTest({
        path: { projectName, testName: args.testName },
        query: {
          viewport: args.viewport,
          browser: args.browser,
          environment: args.environment,
        },
      }),

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
