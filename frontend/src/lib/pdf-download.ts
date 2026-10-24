import type { Ref } from "vue";
import { pdfControllerDownloadPdf } from "@sdk";
import { getData } from "@/lib/sdk";
import type { VariantParams } from "@/lib/variant-key";

export type PdfDownloadType = "baseline" | "candidate" | "diff";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadPdfFile(
  projectName: Ref<string>,
  testName: Ref<string>,
  type: PdfDownloadType,
  variant?: VariantParams,
  branchName?: string,
): Promise<void> {
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
  const data = getData<Blob>(result);
  if (data) {
    triggerDownload(data, `${testName.value}-${type}.pdf`);
  }
}
