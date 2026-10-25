import { describe, it, expect } from "vitest";
import {
  approvalsControllerApprovePdfTest,
  approvalsControllerApproveVisualTest,
  projectsControllerGetOneProject,
  projectsControllerGetProjectsWithPendingFlag,
  testsQueriesControllerGetKind,
  pdfControllerGetPdfTestDetails,
  pdfControllerRenderPdfPage,
  uploadControllerUpload,
} from "../../sdk.gen";
import type { ProjectDto } from "../../models/ProjectDto.gen";
import type { ApproveResultDto } from "../../models/ApproveResultDto.gen";
import type { ApprovalsControllerApprovePdfTestData } from "../../models/ApprovalsControllerApprovePdfTestData.gen";
import {
  ComparisonOutcome,
  ComparisonStatus,
  ScreenshotType,
  ComparisonErrorCode,
} from "../../types.gen";

const SDK_FUNCTIONS = [
  ["approvalsControllerApprovePdfTest", approvalsControllerApprovePdfTest],
  ["approvalsControllerApproveVisualTest", approvalsControllerApproveVisualTest],
  ["projectsControllerGetOneProject", projectsControllerGetOneProject],
  ["projectsControllerGetProjectsWithPendingFlag", projectsControllerGetProjectsWithPendingFlag],
  ["testsQueriesControllerGetKind", testsQueriesControllerGetKind],
  ["pdfControllerGetPdfTestDetails", pdfControllerGetPdfTestDetails],
  ["pdfControllerRenderPdfPage", pdfControllerRenderPdfPage],
  ["uploadControllerUpload", uploadControllerUpload],
] as const;

describe("SDK smoke test", () => {
  it.each(SDK_FUNCTIONS)("%s is a function", (_name, fn) => {
    expect(typeof fn).toBe("function");
  });

  it("exports key enum values", () => {
    expect(ComparisonOutcome.IDENTICAL).toBe("identical");
    expect(ComparisonStatus.PENDING_APPROVAL).toBe("PENDING_APPROVAL");
    expect(ScreenshotType.BASELINE).toBe("BASELINE");
    expect(ComparisonErrorCode.IMAGE_DIFFERENCE).toBe("image_difference");
  });

  it("exports key types (compilation check)", () => {
    const _dto: ProjectDto = { name: "test" };
    const _result: ApproveResultDto = {
      approved: true,
      newBaselineUrl: "https://example.com/baseline.pdf",
      signedNewBaselineUrl: "https://example.com/baseline.pdf?sig",
    };
    const _data: ApprovalsControllerApprovePdfTestData = {
      url: "/projects/{projectName}/tests/{testName}/pdf-approval" as const,
      path: { projectName: "p", testName: "t" },
      body: { comparisonId: "comp-1" },
    };
    expect(_dto.name).toBe("test");
    expect(_result.approved).toBe(true);
    expect(_data.path.projectName).toBe("p");
  });
});
