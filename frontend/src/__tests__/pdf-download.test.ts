import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { pdfControllerDownloadPdf } from "@sdk";
import { downloadPdfFile } from "@/lib/pdf-download";

vi.mock("@sdk", () => ({
  pdfControllerDownloadPdf: vi.fn(),
}));

const mockPdfControllerDownloadPdf = pdfControllerDownloadPdf as ReturnType<
  typeof vi.fn
>;

describe("downloadPdfFile", () => {
  let createSpy: ReturnType<typeof vi.spyOn>;
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the requested pdf via the SDK", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({
      data: new Blob(["pdf"]),
    });

    await downloadPdfFile(ref("my-project"), ref("login-form"), "baseline", {
      viewport: "A4",
      browser: "pdf",
      environment: "staging",
    });

    expect(mockPdfControllerDownloadPdf).toHaveBeenCalledWith({
      path: { projectName: "my-project", testName: "login-form" },
      query: {
        type: "baseline",
        viewport: "A4",
        browser: "pdf",
        environment: "staging",
      },
    });
    expect(createSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();
  });

  it("passes the requested type through to the SDK", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({
      data: new Blob(["pdf"]),
    });

    await downloadPdfFile(ref("my-project"), ref("login-form"), "diff", {
      viewport: "A4",
      browser: "pdf",
      environment: "staging",
    });

    expect(mockPdfControllerDownloadPdf).toHaveBeenCalledWith({
      path: { projectName: "my-project", testName: "login-form" },
      query: {
        type: "diff",
        viewport: "A4",
        browser: "pdf",
        environment: "staging",
      },
    });
  });

  it("does not pass a variant when none is provided", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({
      data: new Blob(["pdf"]),
    });

    await downloadPdfFile(ref("my-project"), ref("login-form"), "candidate");

    expect(mockPdfControllerDownloadPdf).toHaveBeenCalledWith({
      path: { projectName: "my-project", testName: "login-form" },
      query: { type: "candidate" },
    });
    expect(createSpy).toHaveBeenCalled();
  });

  it("does not trigger a download when the SDK returns no data", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({});

    await downloadPdfFile(ref("my-project"), ref("login-form"), "candidate");

    expect(createSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
