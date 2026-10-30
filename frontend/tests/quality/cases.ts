import { TEST_ID } from "@/lib/test-ids";

import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "../ct/mocks/projects.mocks";
import { GROUPS_RESPONSE } from "../ct/mocks/groups.mocks";
import { API_KEYS_RESPONSE } from "../ct/mocks/apiKeys.mocks";
import { PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT } from "../ct/mocks/pdfTest.mocks";
import {
  PDF_BASELINE_HISTORY,
  VISUAL_BASELINE_HISTORY,
} from "../ct/mocks/baselineHistory.mocks";
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
  // Extra gates the shot/scan waits for. A rail section is only in the layout
  // once its tab is selected, so waiting for one of its rows also waits for the
  // tab the rail opened on.
  readyAlsoTestId?: string | string[];
  // Dynamic content (counts, avatars) that must not make screenshots flaky.
  maskTestIds?: string[];
}

const PROJECTS_GLOB = "**/api/v1/projects/pending*";
// The detail route is paginated: the request carries ?skip&take, and a glob
// without a trailing wildcard does not match a query string — the call would
// escape the mock and hit the Vite proxy instead.
const PROJECT_DETAILS_GLOB = "**/api/v1/projects/checkout-ui*";
// The settings page reads the storage aggregate; a glob without the trailing
// wildcard keeps it from being shadowed by the project read above.
const PROJECT_STORAGE_GLOB = "**/api/v1/projects/checkout-ui/storage";
const PROJECT_STORAGE_RESPONSE: FulfillResponse = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    usageBytes: "5242880",
    quotaBytes: "10485760",
    percent: 50,
    softPercent: 80,
    warning: false,
    fileCount: 12,
    diffCount: 3,
    baselineRevisionLimit: 5,
    runHistoryDays: 30,
    orphanGraceHours: 24,
  }),
};
const VISUAL_DETAILS_ROUTE = `/projects/checkout-ui/tests/checkout-flow?${CHROME_1920_1080_STAGING}`;
// Pinned to the path, tolerant of the query: the variant identity comes from the
// route, and a reordered/unextended query must not silently unmock the call.
const VISUAL_DETAILS_GLOB =
  "**/api/v1/projects/checkout-ui/tests/checkout-flow?*";
const VISUAL_PENDING_GLOB =
  "**/api/v1/projects/checkout-ui/tests/meta/pending*";
const VISUAL_VARIANTS_GLOB =
  "**/api/v1/projects/checkout-ui/tests/checkout-flow/variants*";
const PDF_DETAILS_ROUTE = `/projects/checkout-ui/tests/invoice?${CHROME_1920_1080_STAGING}`;
const PDF_DETAILS_GLOB =
  "**/api/v1/projects/checkout-ui/tests/invoice/pdf-details?*";
const VISUAL_BASELINE_HISTORY_GLOB =
  "**/api/v1/projects/checkout-ui/tests/checkout-flow/baseline-history*";
const PDF_BASELINE_HISTORY_GLOB =
  "**/api/v1/projects/checkout-ui/tests/invoice/baseline-history*";

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
    name: "project-settings",
    story: "views/ProjectSettingsView/Routed",
    props: { initialRoute: "/projects/checkout-ui/settings" },
    routes: [
      [PROJECT_STORAGE_GLOB, PROJECT_STORAGE_RESPONSE],
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
    ],
    readyTestId: TEST_ID.storageUsage,
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
      // Registered last so it wins over mockApi's empty default: the quality
      // and axe gates then see the history rows, not just the empty state.
      [VISUAL_BASELINE_HISTORY_GLOB, VISUAL_BASELINE_HISTORY],
    ],
    readyTestId: TEST_ID.comparisonView,
    // The rail opens on the populated section (history), so its rows gate the
    // shot instead of a tab that may still be switching.
    readyAlsoTestId: [TEST_ID.breadcrumbGroup, TEST_ID.baselineHistoryRow],
  },
  {
    name: "pdf-test-details",
    story: "views/PdfTestDetailsView/Routed",
    props: { initialRoute: PDF_DETAILS_ROUTE },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [PDF_DETAILS_GLOB, PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT],
      [PDF_BASELINE_HISTORY_GLOB, PDF_BASELINE_HISTORY],
    ],
    readyTestId: TEST_ID.pdfPageCountUnknown,
    readyAlsoTestId: [TEST_ID.breadcrumbGroup, TEST_ID.baselineHistoryRow],
  },
  {
    name: "inbox",
    story: "views/InboxView/Inbox",
    routes: [["**/api/v1/review/pending*", REVIEW_INBOX_RESPONSE]],
    readyTestId: TEST_ID.inboxItem,
    maskTestIds: [TEST_ID.inboxBadge],
  },
  {
    name: "groups",
    story: "views/GroupsView/Groups",
    routes: [["**/api/v1/groups", GROUPS_RESPONSE]],
    readyTestId: TEST_ID.groupRow,
  },
  {
    name: "api-keys",
    story: "views/ApiKeysView/ApiKeys",
    routes: [["**/api/v1/api-keys", API_KEYS_RESPONSE]],
    readyTestId: TEST_ID.apiKeyRow,
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
    maskTestIds: [TEST_ID.inboxBadge],
  },
];
