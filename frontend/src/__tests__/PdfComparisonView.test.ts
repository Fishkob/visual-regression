import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PdfComparisonView from "@/components/pdf/PdfComparisonView.vue";
import ApprovalDecisionDialog from "@/components/approvals/ApprovalDecisionDialog.vue";
import type { PdfComparison } from "@/domains/pdf-test/pdf-test.model";

// The review footer's role gate reads the session; these tests exercise the
// writer's chrome.
vi.mock("@/composables/useAuth", () => ({
  useCurrentRole: () => ({ canWrite: true }),
}));

const baseline = {
  pdfUrl: "/baseline.pdf",
  imageHash: "abc123",
};

const comparison: PdfComparison = {
  id: "cmp-1",
  diffPdfUrl: "/diff.pdf",
  pageCount: 5,
  mismatchPageCount: 2,
  status: "PENDING_APPROVAL",
  createdAt: "2024-01-01T00:00:00Z",
  candidate: {
    pdfUrl: "/candidate.pdf",
    imageHash: "def456",
  },
};

const stubs = {
  Button: { template: '<button data-testid="btn-stub"><slot/></button>' },
  PdfPageViewer: { template: '<div data-testid="pdf-viewer-stub" />' },
  PdfPageNavigation: { template: '<div data-testid="pdf-nav-stub" />' },
};

describe("PdfComparisonView", () => {
  it("renders baseline, candidate, and diff PdfPageViewers in Side by Side mode", () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });

    expect(wrapper.findAll('[data-testid="pdf-viewer-stub"]').length).toBe(3);
  });

  it("renders only baseline and diff in Side by Side mode when no candidate", () => {
    const noCandidate = { ...comparison, candidate: undefined };
    const wrapper = mount(PdfComparisonView, {
      props: {
        projectName: "proj",
        testName: "test",
        baseline,
        comparison: noCandidate,
      },
      global: { stubs },
    });

    expect(wrapper.findAll('[data-testid="pdf-viewer-stub"]').length).toBe(2);
  });

  it("renders only diff in Diff Only mode", async () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });

    await wrapper.find('[data-testid="mode-diff"]').trigger("click");

    expect(wrapper.findAll('[data-testid="pdf-viewer-stub"]').length).toBe(1);
  });

  it("shows mismatch info with page count", () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });

    expect(wrapper.find('[data-testid="mismatch-info"]').text()).toBe(
      "2 of 5 pages differ",
    );
  });

  it('shows "All pages match" when mismatchPageCount is 0', () => {
    const allMatch = { ...comparison, mismatchPageCount: 0 };
    const wrapper = mount(PdfComparisonView, {
      props: {
        projectName: "proj",
        testName: "test",
        baseline,
        comparison: allMatch,
      },
      global: { stubs },
    });

    expect(wrapper.find('[data-testid="mismatch-info"]').text()).toBe(
      "All pages match",
    );
  });

  it('shows "Approve changes" button when status is not APPROVED', () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Approve changes");
  });

  it('shows "Back to project" when status is APPROVED', () => {
    const approved: PdfComparison = { ...comparison, status: "APPROVED" };
    const wrapper = mount(PdfComparisonView, {
      props: {
        projectName: "proj",
        testName: "test",
        baseline,
        comparison: approved,
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Back to project");
  });

  it('does not show "Approve changes" when status is APPROVED', () => {
    const approved: PdfComparison = { ...comparison, status: "APPROVED" };
    const wrapper = mount(PdfComparisonView, {
      props: {
        projectName: "proj",
        testName: "test",
        baseline,
        comparison: approved,
      },
      global: { stubs },
    });

    expect(wrapper.text()).not.toContain("Approve changes");
  });

  it("collects an optional reason before emitting approve", async () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: {
        stubs: {
          ...stubs,
          DialogPortal: { template: "<slot />" },
        },
      },
    });

    await wrapper.find('[data-testid="approve-changes"]').trigger("click");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("approve")).toContainEqual([{}]);
  });

  it("emits skip when Skip button is clicked", async () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });

    await wrapper.find('[data-testid="skip"]').trigger("click");

    expect(wrapper.emitted("skip")).toBeTruthy();
  });

  it("shows PdfPageNavigation when pageCount > 1", () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });

    expect(wrapper.findAll('[data-testid="pdf-nav-stub"]').length).toBe(1);
  });

  it("hides PdfPageNavigation when pageCount <= 1", () => {
    const singlePage = { ...comparison, pageCount: 1 };
    const wrapper = mount(PdfComparisonView, {
      props: {
        projectName: "proj",
        testName: "test",
        baseline,
        comparison: singlePage,
      },
      global: { stubs },
    });

    expect(wrapper.findAll('[data-testid="pdf-nav-stub"]').length).toBe(0);
  });

  it("hides the diff panel and download link when the diff pdf was removed after approval", () => {
    const approved: PdfComparison = {
      ...comparison,
      status: "APPROVED",
      diffPdfUrl: "",
    };
    const wrapper = mount(PdfComparisonView, {
      props: {
        projectName: "proj",
        testName: "test",
        baseline,
        comparison: approved,
      },
      global: { stubs },
    });

    expect(wrapper.findAll('[data-testid="pdf-viewer-stub"]').length).toBe(2);
    expect(wrapper.find('[data-testid="download-diff"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mode-diff"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Diff removed after approval");
  });

  it("still shows the diff panel for a pending comparison with a diff pdf", () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });

    expect(wrapper.findAll('[data-testid="pdf-viewer-stub"]').length).toBe(3);
    expect(wrapper.find('[data-testid="download-diff"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-diff"]').exists()).toBe(true);
  });

  it("opens the decision dialog through the exposed review action", async () => {
    const wrapper = mount(PdfComparisonView, {
      props: { projectName: "proj", testName: "test", baseline, comparison },
      global: { stubs },
    });
    const dialog = wrapper.findComponent(ApprovalDecisionDialog);
    expect(dialog.props("open")).toBe(false);

    (wrapper.vm as unknown as { openDecision: () => void }).openDecision();
    await wrapper.vm.$nextTick();

    expect(dialog.props("open")).toBe(true);
  });
});
