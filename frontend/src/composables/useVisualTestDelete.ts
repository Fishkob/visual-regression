import { translateMessage as tm } from "@/lib/i18n-messages";
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
      tm("toast.testDeleted", {
        variant:
          formatVariantLabel({ viewport, browser, environment }) ||
          tm("toast.entireTest"),
        test: testName,
      }),

    errorMessage: tm("toast.testDeleteError"),

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
