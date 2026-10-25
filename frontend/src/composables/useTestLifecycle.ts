import { unref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import {
  testLifecycleControllerGet,
  testLifecycleControllerUpdate,
  type TestMetadataDto,
} from "@sdk";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { mapTestMetadata } from "@/domains/test-lifecycle/test-metadata.mapper";
import type {
  TestMetadata,
  UpdateTestMetadataInput,
} from "@/domains/test-lifecycle/test-metadata.model";
import { testMetadataQueryKeys } from "@/domains/test-lifecycle/query-keys";
import { invalidateAfterTestMetadataChange } from "@/lib/invalidation";
import { unwrapSdkData } from "@/lib/sdk";

export function useTestMetadata(
  projectName: MaybeRef<string>,
  testName: MaybeRef<string>,
  branch: MaybeRef<string | undefined>,
) {
  return useSdkQuery({
    args: { projectName, testName, branch },
    required: ["projectName", "testName"],
    keyOf: ({ projectName, testName, branch }) =>
      testMetadataQueryKeys.detail(projectName, testName, branch),
    sdkFn: ({ projectName, testName, branch }) =>
      testLifecycleControllerGet({
        path: { projectName, testName },
        ...(branch ? { query: { branch } } : {}),
      }),
    map: (dto: TestMetadataDto | undefined) => mapTestMetadata(dto),
  });
}

// The generated spec double-nests tags; the wire body keeps the flat array the
// backend expects and the cast bridges the generator quirk. Omitted fields stay
// untouched server-side, so the editor only sends what it means to change.
function toUpdateBody(input: UpdateTestMetadataInput) {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(input.tags === undefined
      ? {}
      : { tags: input.tags }),
    ...(input.mutedUntil === undefined ? {} : { mutedUntil: input.mutedUntil }),
    ...(input.muteReason === undefined ? {} : { muteReason: input.muteReason }),
  };
}

export function useUpdateTestMetadata(
  projectName: MaybeRef<string>,
  testName: MaybeRef<string>,
  branch: MaybeRef<string | undefined>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UpdateTestMetadataInput,
    ): Promise<TestMetadata> => {
      const branchName = unref(branch);
      const response = await testLifecycleControllerUpdate({
        path: {
          projectName: unref(projectName),
          testName: unref(testName),
        },
        ...(branchName ? { query: { branch: branchName } } : {}),
        body: toUpdateBody(input),
      });
      const metadata = mapTestMetadata(
        unwrapSdkData<TestMetadataDto>(response, "Could not update the test"),
      );
      if (!metadata) throw new Error("The update returned no metadata");
      return metadata;
    },
    onSuccess: () => {
      // A rename, a tag change and a mute all move the inbox/pending reads; the
      // metadata itself is refreshed through the same fan-out.
      invalidateAfterTestMetadataChange(queryClient);
      toast.success("Test updated");
    },
    onError: () => {
      toast.error("Could not update the test");
    },
  });
}
