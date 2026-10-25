import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { pdfControllerDownloadPdf } from "@sdk";
import { toast } from "vue-sonner";
import { downloadPdfFile } from "@/lib/pdf-download";

vi.mock("@sdk", () => ({
  pdfControllerDownloadPdf: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockPdfControllerDownloadPdf = pdfControllerDownloadPdf as ReturnType<
  typeof vi.fn
>;
const mockToastError = vi.mocked(toast.error);

const flushTimers = () =>
  new Promise((resolve) => window.setTimeout(resolve, 0));

describe("downloadPdfFile", () => {
  let createSpy: ReturnType<typeof vi.spyOn>;
  let revokeSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let anchorsInDocumentAtClick: number[];

  beforeEach(() => {
    anchorsInDocumentAtClick = [];
    createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        anchorsInDocumentAtClick.push(
          document.body.querySelectorAll("a[download]").length,
        );
      });
  });

  afterEach(async () => {
    await flushTimers();
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
    expect(createSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("attaches the anchor while clicking and revokes on the next tick", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({
      data: new Blob(["pdf"]),
    });

    await downloadPdfFile(ref("my-project"), ref("login-form"), "baseline");

    expect(anchorsInDocumentAtClick).toEqual([1]);
    expect(document.body.querySelector("a[download]")).toBeNull();
    expect(revokeSpy).not.toHaveBeenCalled();

    await flushTimers();

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
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

  it("scopes the download to the selected branch", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({
      data: new Blob(["pdf"]),
    });

    await downloadPdfFile(
      ref("my-project"),
      ref("login-form"),
      "diff",
      { viewport: "A4", browser: "pdf", environment: "staging" },
      "feature/x",
    );

    expect(mockPdfControllerDownloadPdf).toHaveBeenCalledWith({
      path: { projectName: "my-project", testName: "login-form" },
      query: {
        type: "diff",
        viewport: "A4",
        browser: "pdf",
        environment: "staging",
        branch: "feature/x",
      },
    });
  });

  it("does not trigger a download when the SDK returns no data", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({});

    await downloadPdfFile(ref("my-project"), ref("login-form"), "candidate");

    expect(createSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("reports an SDK error payload instead of failing silently", async () => {
    mockPdfControllerDownloadPdf.mockResolvedValue({
      error: { message: "Not found" },
    });

    await downloadPdfFile(ref("my-project"), ref("login-form"), "baseline");

    expect(mockToastError).toHaveBeenCalledWith("PDF download failed");
    expect(createSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("reports a rejected SDK call instead of failing silently", async () => {
    mockPdfControllerDownloadPdf.mockRejectedValue(new Error("network error"));

    await downloadPdfFile(ref("my-project"), ref("login-form"), "baseline");

    expect(mockToastError).toHaveBeenCalledWith("PDF download failed");
    expect(createSpy).not.toHaveBeenCalled();
  });
});
