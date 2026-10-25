import { translateMessage as tm } from "@/lib/i18n-messages";
import { ref, watch, type Ref, unref } from "vue";
import {
  type UpdateThresholdResultDto,
  testCommandsControllerUpdateThreshold,
} from "@sdk";
import { toast } from "vue-sonner";
import { invalidateVisualTestDetails } from "@/lib/invalidation";
import { formatVariantLabel } from "@/lib/format-variant-label";
import type { VariantParams } from "@/lib/variant-key";
import type { Screenshot } from "@/domains/visual-test/visual-test.model";
import { previewSdkRead, type MaybeRef } from "@/composables/useDomainQuery";
import { useSdkMutation } from "@/composables/useSdkMutation";

export interface ThresholdEditorOptions {
  baseline: Screenshot | undefined;
  projectName: string;
  testName: string;
  branchName?: MaybeRef<string | undefined>;
  variant: Ref<VariantParams>;
}

export type ThresholdUpdateArgs = {
  projectName: string;
  testName: string;
  threshold: number;
  branch?: string;
  viewport?: string;
  browser?: string;
  environment?: string;
};

// Single home for the threshold endpoint call shape. The commit mutation and
// the preview read both hit the same endpoint with the same args tuple; only
// the preview flag differs. A change to the endpoint shape lands here once.
function callUpdateThreshold(
  args: ThresholdUpdateArgs,
  preview: boolean,
): Promise<unknown> {
  return testCommandsControllerUpdateThreshold({
    path: { projectName: args.projectName, testName: args.testName },
    body: { threshold: args.threshold },
    query: {
      viewport: args.viewport,
      browser: args.browser,
      environment: args.environment,
      ...(args.branch ? { branch: args.branch } : {}),
      ...(preview ? { preview: "true" } : {}),
    },
  });
}

export function useThresholdEditor(options: ThresholdEditorOptions) {
  const { baseline, projectName, testName, branchName, variant } = options;

  const threshold = ref<number>(baseline?.pixelDiffThreshold ?? 0);
  const inputValue = ref<string>(String(threshold.value));

  const confirmVisible = ref(false);
  const pendingThreshold = ref<number | null>(null);

  // The committed threshold and the input text are kept in lockstep ONLY here:
  // a server-synced value (baseline change, successful commit) funnels through
  // this seam, so the mirror rule has one home instead of being re-encoded at
  // every site that learns a new threshold. One-directional writes (resetInputToCurrent,
  // the onBlur clamp) read `threshold` and normalize the text without touching it.
  function syncThreshold(next: number) {
    threshold.value = next;
    inputValue.value = String(next);
  }

  watch(
    () => baseline?.pixelDiffThreshold,
    (newVal) => syncThreshold(typeof newVal === "number" ? newVal : 0),
  );

  const { mutate: updateThreshold, isPending: updateThresholdPending } =
    useSdkMutation<UpdateThresholdResultDto, ThresholdUpdateArgs>({
      mutationFn: (args) => callUpdateThreshold(args, false),

      successMessage: (data, { testName, viewport, browser, environment }) => {
        syncThreshold(data.threshold ?? 0);
        const variantInfo =
          formatVariantLabel({ viewport, browser, environment }) ||
          tm("toast.entireTest");
        const accepted = data.autoAcceptedCount
          ? tm("toast.thresholdAccepted", { count: data.autoAcceptedCount })
          : "";
        return tm("toast.thresholdUpdated", {
          variant: variantInfo,
          test: testName,
          accepted,
        });
      },

      errorMessage: tm("toast.thresholdError"),

      invalidate: (
        client,
        _,
        {
          projectName: pn,
          testName: tn,
          branch,
          viewport,
          browser,
          environment,
        },
      ) =>
        invalidateVisualTestDetails(client, {
          projectName: pn,
          testName: tn,
          ...(branch ? { branch } : {}),
          viewport,
          browser,
          environment,
        }),
    });

  function resetInputToCurrent() {
    inputValue.value = String(threshold.value);
  }

  // The parse + clamp rule for the threshold input, single-sourced: a non-number
  // is rejected, and a negative value is clamped to 0. Returns whether the value
  // was clamped so the caller can normalize the visible text. Accepts a number
  // too — v-model on a type="number" input already casts the DOM string to a
  // number, so the editor must not assume a string arrives.
  function parseThresholdInput(
    raw: string | number,
  ): { value: number; clamped: boolean } | null {
    const parsed = parseInt(String(raw).trim(), 10);
    if (Number.isNaN(parsed)) return null;
    const value = Math.max(0, parsed);
    return { value, clamped: value !== parsed };
  }

  // Single builder for the threshold endpoint args — commit and preview share
  // the same tuple, so a field added here is present in both calls.
  function buildArgs(nextValue: number): ThresholdUpdateArgs {
    const v = unref(variant);
    const branch = unref(branchName);
    return {
      projectName,
      testName,
      threshold: nextValue,
      ...(branch ? { branch } : {}),
      viewport: v.viewport,
      browser: v.browser,
      environment: v.environment,
    };
  }

  function commitThreshold(nextValue: number) {
    updateThreshold(buildArgs(nextValue));
  }

  // The auto-accept decision is owned by the server: ask how many pending
  // comparisons a threshold would accept (preview=true) instead of re-encoding
  // "mismatch <= threshold" on the client. A failed preview must NOT fall
  // through to a direct commit — the confirm step exists to protect the
  // auto-accept case, and committing without it would let an unknown number of
  // comparisons be accepted silently. The unwrap + failure-to-null lives on the
  // preview seam (previewSdkRead), not here. Returns null when the preview failed.
  async function previewAutoAccept(nextValue: number): Promise<number | null> {
    const result = await previewSdkRead<UpdateThresholdResultDto>(() =>
      callUpdateThreshold(buildArgs(nextValue), true),
    );
    return result == null ? null : (result.autoAcceptedCount ?? 0);
  }

  async function onBlur() {
    const result = parseThresholdInput(inputValue.value);

    if (!result) {
      resetInputToCurrent();
      toast.error(tm("toast.invalidNumber"));
      return;
    }

    if (result.clamped) {
      inputValue.value = String(result.value);
    }

    if (result.value === threshold.value) return;

    const autoAcceptedCount = await previewAutoAccept(result.value);

    if (autoAcceptedCount === null) {
      toast.error(tm("toast.thresholdCheckError"));
      resetInputToCurrent();
      return;
    }

    if (autoAcceptedCount > 0) {
      pendingThreshold.value = result.value;
      confirmVisible.value = true;
      return;
    }

    commitThreshold(result.value);
  }

  function handleCancelThreshold() {
    confirmVisible.value = false;
    pendingThreshold.value = null;
    resetInputToCurrent();
  }

  function handleConfirmThreshold() {
    if (pendingThreshold.value == null) return;

    commitThreshold(pendingThreshold.value);

    confirmVisible.value = false;
    pendingThreshold.value = null;
  }

  return {
    inputValue,
    threshold,
    confirmVisible,
    pendingThreshold,
    updateThresholdPending,
    onBlur,
    handleCancelThreshold,
    handleConfirmThreshold,
  };
}
