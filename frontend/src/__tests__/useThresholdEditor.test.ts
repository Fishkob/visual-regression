import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import {
  useThresholdEditor,
  type ThresholdEditorOptions,
} from "@/composables/useThresholdEditor";

const mockPreview = vi.fn();
const mockMutate = vi.hoisted(() => vi.fn());

vi.mock("@sdk", () => ({
  testCommandsControllerUpdateThreshold: (...args: unknown[]) =>
    mockPreview(...args),
}));

vi.mock("@tanstack/vue-query", () => ({
  useMutation: vi.fn(() => ({
    mutate: mockMutate,
    isPending: ref(false),
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("useThresholdEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreview.mockReset();
  });

  const createOptions = (
    overrides: Partial<ThresholdEditorOptions> = {},
  ): ThresholdEditorOptions => ({
    baseline: undefined,
    projectName: "test-project",
    testName: "test-login-form",
    variant: ref({ viewport: "1920x1080", browser: "chrome" }),
    ...overrides,
  });

  const previewResponse = (autoAcceptedCount: number) =>
    Promise.resolve({ data: { autoAcceptedCount }, error: undefined });

  it("initializes threshold from baseline", () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.5 } as any,
    });

    const { threshold } = useThresholdEditor(options);

    expect(threshold.value).toBe(0.5);
  });

  it("initializes threshold to 0 when baseline is undefined", () => {
    const options = createOptions({
      baseline: undefined,
    });

    const { threshold } = useThresholdEditor(options);

    expect(threshold.value).toBe(0);
  });

  it("initializes inputValue from threshold", () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.1 } as any,
    });

    const { inputValue } = useThresholdEditor(options);

    expect(inputValue.value).toBe("0.1");
  });

  it("resets input to current threshold on handleCancelThreshold", () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.5 } as any,
    });

    const { inputValue, handleCancelThreshold } = useThresholdEditor(options);

    inputValue.value = "1.0";

    // Internal reset happens on cancel
    handleCancelThreshold();

    expect(inputValue.value).toBe("0.5");
  });

  it("shows confirmation when the server preview reports an auto-accept", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.1 } as any,
    });
    mockPreview.mockResolvedValue(previewResponse(1));

    const { inputValue, onBlur, confirmVisible } = useThresholdEditor(options);

    inputValue.value = "100";

    await onBlur();

    expect(mockPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { threshold: 100 },
        query: expect.objectContaining({ preview: "true" }),
      }),
    );
    expect(confirmVisible.value).toBe(true);
  });

  it("commits directly when the server preview reports no auto-accept", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.1 } as any,
    });
    mockPreview.mockResolvedValue(previewResponse(0));

    const { inputValue, onBlur, confirmVisible } = useThresholdEditor(options);

    inputValue.value = "50";

    await onBlur();

    expect(confirmVisible.value).toBe(false);
  });

  it("does not show a confirm when there is no pending comparison to accept", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.1 } as any,
    });
    mockPreview.mockResolvedValue(previewResponse(0));

    const { inputValue, onBlur, confirmVisible } = useThresholdEditor(options);

    inputValue.value = "100";

    await onBlur();

    expect(confirmVisible.value).toBe(false);
  });

  it("resets input on cancel", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.5 } as any,
    });
    mockPreview.mockResolvedValue(previewResponse(1));

    const {
      inputValue,
      onBlur,
      handleCancelThreshold,
      confirmVisible,
      pendingThreshold,
    } = useThresholdEditor(options);

    inputValue.value = "100";
    await onBlur();
    expect(confirmVisible.value).toBe(true);

    handleCancelThreshold();

    expect(confirmVisible.value).toBe(false);
    expect(pendingThreshold.value).toBeNull();
    expect(inputValue.value).toBe("0.5");
  });

  it("commits the pending threshold on confirm", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.5 } as any,
    });
    mockPreview.mockResolvedValue(previewResponse(1));

    const {
      inputValue,
      onBlur,
      handleConfirmThreshold,
      confirmVisible,
      pendingThreshold,
    } = useThresholdEditor(options);

    inputValue.value = "100";
    await onBlur();

    expect(confirmVisible.value).toBe(true);

    handleConfirmThreshold();

    expect(mockMutate).toHaveBeenCalledOnce();
    expect(mockMutate).toHaveBeenCalledWith({
      projectName: "test-project",
      testName: "test-login-form",
      threshold: 100,
      viewport: "1920x1080",
      browser: "chrome",
      environment: undefined,
    });
    expect(confirmVisible.value).toBe(false);
    expect(pendingThreshold.value).toBeNull();
  });

  it("clamps negative values to 0 on blur", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.5 } as any,
    });
    mockPreview.mockResolvedValue(previewResponse(0));

    const { inputValue, onBlur } = useThresholdEditor(options);

    inputValue.value = "-10";

    await onBlur();

    expect(inputValue.value).toBe("0");
  });

  it("resets input when non-numeric value entered", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.5 } as any,
    });

    const { inputValue, onBlur } = useThresholdEditor(options);

    inputValue.value = "abc";

    await onBlur();

    expect(inputValue.value).toBe("0.5");
  });

  it("keeps the typed value when the preview reports no auto-accept", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.1 } as any,
    });
    mockPreview.mockResolvedValue(previewResponse(0));

    const { inputValue, onBlur } = useThresholdEditor(options);

    inputValue.value = "50";

    await onBlur();

    expect(inputValue.value).toBe("50");
  });

  it("does not commit blindly when the preview fails", async () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.1 } as any,
    });
    mockPreview.mockRejectedValue(new Error("preview failed"));

    const { inputValue, onBlur, confirmVisible, pendingThreshold } =
      useThresholdEditor(options);

    inputValue.value = "50";

    await onBlur();

    expect(confirmVisible.value).toBe(false);
    expect(pendingThreshold.value).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
    expect(inputValue.value).toBe("0.1");
  });

  it("initializes with provided baseline threshold", () => {
    const options = createOptions({
      baseline: { pixelDiffThreshold: 0.8 } as any,
    });

    const { threshold } = useThresholdEditor(options);

    expect(threshold.value).toBe(0.8);
  });
});
