import type { Ref } from "vue";
import { pdfControllerDownloadPdf } from "@sdk";
import { toast } from "vue-sonner";
import { unwrapSdkData } from "@/lib/sdk";
import type { VariantParams } from "@/lib/variant-key";

export type PdfDownloadType = "baseline" | "candidate" | "diff";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadPdfFile(
  projectName: Ref<string>,
  testName: Ref<string>,
  type: PdfDownloadType,
  variant?: VariantParams,
  branchName?: string,
): Promise<void> {
  try {
    const result = await pdfControllerDownloadPdf({
      path: {
        projectName: projectName.value,
        testName: testName.value,
      },
      query: {
        type,
        viewport: variant?.viewport,
        browser: variant?.browser,
        environment: variant?.environment,
        ...(branchName ? { branch: branchName } : {}),
      },
    });
    const data = unwrapSdkData<Blob>(result);
    if (!data) throw new Error("PDF download returned no data");
    triggerDownload(data, `${testName.value}-${type}.pdf`);
  } catch {
    toast.error("PDF download failed");
  }
}
