import { TEST_ID } from "@/lib/test-ids";

import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "../ct/mocks/projects.mocks";
import { GROUPS_RESPONSE } from "../ct/mocks/groups.mocks";
import { PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT } from "../ct/mocks/pdfTest.mocks";
import { makeReviewableDetails } from "../ct/mocks/reviewLoop.mocks";
import { CHROME_1920_1080_STAGING } from "../ct/mocks/variants";
import {
  VISUAL_TEST_PENDING_META,
  VISUAL_TEST_VARIANTS_SINGLE,
} from "../ct/mocks/visualTest.mocks";
import type { FulfillResponse } from "../ct/routes/api.routes";

type MockRoute = [glob: string, response: FulfillResponse];

export type Theme = "light" | "dark";

export const THEMES: Theme[] = ["light", "dark"];

export interface QualityCase {
  name: string;
  story: string;
  props?: Record<string, unknown>;
  routes?: MockRoute[];
  readyTestId: string;
  readyAlsoTestId?: string;
}

const PROJECTS_GLOB = "**/api/v1/projects/pending*";
const PROJECT_DETAILS_GLOB = "**/api/v1/projects/checkout-ui";
const VISUAL_DETAILS_ROUTE = `/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const VISUAL_DETAILS_GLOB = `**/api/v1/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
const VISUAL_PENDING_GLOB =
  "**/api/v1/projects/checkout-ui/tests/meta/pending*";
const VISUAL_VARIANTS_GLOB =
  "**/api/v1/projects/checkout-ui/tests/checkout-flow/variants*";
const PDF_DETAILS_ROUTE = `/projects/checkout-ui/tests/invoice?${CHROME_1920_1080_STAGING}`;
const PDF_DETAILS_GLOB = `**/api/v1/projects/checkout-ui/tests/invoice/pdf-details?${CHROME_1920_1080_STAGING}`;

export const QUALITY_CASES: QualityCase[] = [
  {
    name: "projects",
    story: "views/ProjectsView/Projects",
    routes: [
      [PROJECTS_GLOB, PROJECTS_PENDING_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
    ],
    readyTestId: TEST_ID.tableRow,
  },
  {
    name: "project-detail",
    story: "views/ProjectDetailView/Routed",
    props: { initialRoute: "/projects/checkout-ui" },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
    ],
    readyTestId: TEST_ID.tableRow,
  },
  {
    name: "visual-test-details",
    story: "views/VisualTestDetailsView/Routed",
    props: { initialRoute: VISUAL_DETAILS_ROUTE },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [VISUAL_DETAILS_GLOB, makeReviewableDetails("checkout-flow")],
      [VISUAL_PENDING_GLOB, VISUAL_TEST_PENDING_META],
      [VISUAL_VARIANTS_GLOB, VISUAL_TEST_VARIANTS_SINGLE],
    ],
    readyTestId: TEST_ID.comparisonView,
    readyAlsoTestId: TEST_ID.breadcrumbGroup,
  },
  {
    name: "pdf-test-details",
    story: "views/PdfTestDetailsView/Routed",
    props: { initialRoute: PDF_DETAILS_ROUTE },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [PDF_DETAILS_GLOB, PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT],
    ],
    readyTestId: TEST_ID.pdfPageCountUnknown,
    readyAlsoTestId: TEST_ID.breadcrumbGroup,
  },
  {
    name: "inbox",
    story: "views/InboxView/Inbox",
    routes: [["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE]],
    readyTestId: TEST_ID.inboxItem,
  },
  {
    name: "groups",
    story: "views/GroupsView/Groups",
    routes: [["**/api/v1/groups", GROUPS_RESPONSE]],
    readyTestId: TEST_ID.groupRow,
  },
  {
    name: "approval-done",
    story: "views/ApprovalDoneView/ApprovalDone",
    readyTestId: TEST_ID.doneHeading,
  },
  {
    name: "not-found",
    story: "views/NotFoundView/NotFound",
    readyTestId: TEST_ID.backToProjectList,
  },
  {
    name: "app-shell",
    story: "AppShell/AppShell",
    props: { initialRoute: "/projects" },
    routes: [
      [PROJECTS_GLOB, PROJECTS_PENDING_RESPONSE],
      ["**/api/v1/groups", GROUPS_RESPONSE],
      ["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE],
    ],
    readyTestId: TEST_ID.tableRow,
  },
];
