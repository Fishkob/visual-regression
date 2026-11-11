import type { StorageControllerGetResponses } from "@sdk/models/StorageControllerGetResponses.gen";

import { TEST_ID } from "@/lib/test-ids";

import {
  BRANCHES_RESPONSE,
  PROJECT_CHECKOUT_UI_RESPONSE,
  PROJECTS_PENDING_RESPONSE,
  REVIEW_INBOX_RESPONSE,
} from "../ct/mocks/projects.mocks";
import { GROUPS_RESPONSE } from "../ct/mocks/groups.mocks";
import { API_KEYS_RESPONSE } from "../ct/mocks/apiKeys.mocks";
import { WEBHOOKS_RESPONSE } from "../ct/mocks/webhooks.mocks";
import { PDF_TEST_DETAILS_BASELINE_NO_PAGE_COUNT } from "../ct/mocks/pdfTest.mocks";
import {
  PDF_BASELINE_HISTORY,
  VISUAL_BASELINE_HISTORY,
} from "../ct/mocks/baselineHistory.mocks";
import {
  makeImageKind,
  makeReviewableDetails,
  makeReviewableDetailsWithRegions,
} from "../ct/mocks/reviewLoop.mocks";
import { CHROME_1920_1080_STAGING } from "../ct/mocks/variants";
import {
  VISUAL_TEST_PENDING_META,
  VISUAL_TEST_VARIANTS_SINGLE,
  VISUAL_TEST_VARIANTS_DEMO,
  VISUAL_TEST_VARIANTS_BROWSERS_DEMO,
} from "../ct/mocks/visualTest.mocks";
import type { FulfillResponse } from "../ct/routes/api.routes";
import {
  AUDIT_RESPONSE,
  PUBLIC_INVITE_PREVIEW_RESPONSE,
  PUBLIC_SHARE_TEST_RESPONSE,
  RUN_DETAIL_RESPONSE,
  RUNS_RESPONSE,
  SESSIONS_RESPONSE,
  TRENDS_RESPONSE,
  USERS_RESPONSE,
} from "./mocks/pages.mocks";

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
const PROJECT_WEBHOOKS_GLOB = "**/api/v1/projects/checkout-ui/webhooks";
export const PROJECT_STORAGE_RESPONSE: FulfillResponse = {
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
    branchRetentionDays: 90,
    orphanGraceHours: 24,
  } satisfies StorageControllerGetResponses[200]),
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
const OVERVIEW_KIND_GLOB =
  "**/api/v1/projects/checkout-ui/tests/checkout-flow/kind";
const OVERVIEW_VARIANTS_GLOB =
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
      [PROJECT_WEBHOOKS_GLOB, WEBHOOKS_RESPONSE],
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
    ],
    // The settings page is also the home of the endpoint administration, so the
    // shot has to wait for that section instead of only the storage aggregate.
    readyTestId: TEST_ID.storageUsage,
    readyAlsoTestId: TEST_ID.projectSettingsWebhooks,
    // "Created 3 months ago" is relative to the run; its absolute value lives in
    // the title attribute, which the mask hides along with the label.
    maskTestIds: [TEST_ID.webhookCreated],
  },
  {
    // The variant surface: one section per viewport, the browsers of a section
    // labelled side by side. The compare toolbar only appears because two of the
    // four variants share a resolution.
    name: "test-overview",
    story: "views/TestOverviewView/Routed",
    props: {
      initialRoute: "/projects/checkout-ui/tests/checkout-flow/overview",
    },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [OVERVIEW_KIND_GLOB, makeImageKind()],
      [OVERVIEW_VARIANTS_GLOB, VISUAL_TEST_VARIANTS_BROWSERS_DEMO],
    ],
    readyTestId: TEST_ID.testOverviewCard,
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
    // The review page for a comparison whose changed areas are known: it opens
    // on the marked diff with the areas numbered on the picture.
    name: "visual-test-details-regions",
    story: "views/VisualTestDetailsView/Routed",
    props: { initialRoute: VISUAL_DETAILS_ROUTE },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [
        VISUAL_DETAILS_GLOB,
        makeReviewableDetailsWithRegions("checkout-flow", [
          { x: 220, y: 176, width: 134, height: 210, pixelCount: 26460 },
        ]),
      ],
      [VISUAL_PENDING_GLOB, VISUAL_TEST_PENDING_META],
      [VISUAL_VARIANTS_GLOB, VISUAL_TEST_VARIANTS_DEMO],
      [VISUAL_BASELINE_HISTORY_GLOB, VISUAL_BASELINE_HISTORY],
    ],
    readyTestId: TEST_ID.comparisonView,
    // The box only exists once the picture has loaded and reported its size, so
    // it gates the shot on the marked stage instead of an empty card.
    readyAlsoTestId: [TEST_ID.changedRegionBox],
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
  // The stand-alone screens and the admin surfaces. They were reached by the
  // e2e suite only, which photographs nothing and scans nothing: an a11y or
  // layout regression there had no gate. The three auth screens fire no API
  // call, so their cases need no route mocks at all.
  {
    name: "login",
    story: "views/LoginView/Routed",
    props: { initialRoute: "/login" },
    readyTestId: TEST_ID.loginSubmit,
  },
  {
    name: "forbidden",
    story: "views/ForbiddenView/Routed",
    props: { initialRoute: "/forbidden" },
    readyTestId: TEST_ID.forbiddenView,
  },
  {
    name: "change-password",
    story: "views/ChangePasswordView/Routed",
    props: { initialRoute: "/change-password" },
    readyTestId: TEST_ID.changePasswordView,
  },
  {
    name: "users",
    story: "views/UsersView/Routed",
    props: { initialRoute: "/users" },
    routes: [["**/api/v1/users", USERS_RESPONSE]],
    readyTestId: TEST_ID.userRow,
  },
  {
    name: "security",
    story: "views/SecurityView/Routed",
    props: { initialRoute: "/settings/security" },
    routes: [["**/api/v1/auth/sessions", SESSIONS_RESPONSE]],
    readyTestId: TEST_ID.sessionRow,
  },
  {
    name: "audit",
    story: "views/AuditView/Routed",
    props: { initialRoute: "/audit" },
    // The same glob also answers the CSV export; the export is a click, not a
    // page load, so the scan never awaits it.
    routes: [["**/api/v1/audit*", AUDIT_RESPONSE]],
    readyTestId: TEST_ID.auditRow,
  },
  {
    name: "webhooks",
    story: "views/WebhooksView/Routed",
    props: { initialRoute: "/projects/checkout-ui/webhooks" },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      [PROJECT_WEBHOOKS_GLOB, WEBHOOKS_RESPONSE],
    ],
    readyTestId: TEST_ID.webhookRow,
  },
  {
    name: "runs",
    story: "views/RunsView/Routed",
    props: { initialRoute: "/projects/checkout-ui/runs" },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/projects/*/branches*", BRANCHES_RESPONSE],
      // Registered after the project read so it wins for the runs request: a
      // glob without a trailing wildcard would also shadow the detail call.
      ["**/api/v1/projects/*/runs*", RUNS_RESPONSE],
    ],
    readyTestId: TEST_ID.runRow,
  },
  {
    // A run that ended with a failed job: the gate card, the pending table (with
    // its muted row) and the failed-jobs table in one shot. The state is
    // terminal on purpose, so the status poll stays out of the screenshot.
    name: "run-detail",
    story: "views/RunDetailView/Routed",
    props: { initialRoute: "/projects/checkout-ui/runs/ci-1042" },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/projects/*/runs/ci-1042*", RUN_DETAIL_RESPONSE],
    ],
    readyTestId: TEST_ID.runDetail,
    readyAlsoTestId: [
      TEST_ID.runPendingRow,
      TEST_ID.runApprovalRow,
      TEST_ID.runFailedJobRow,
    ],
  },
  {
    // The share page is mounted outside the shell, so this case is its only
    // layout gate: the public resolve endpoint answers a free-form payload and
    // the page renders the pixels of the latest reviewable comparison.
    name: "share",
    story: "views/ShareView/Routed",
    props: { initialRoute: "/share/gallery-share-token" },
    routes: [["**/api/v1/public/shares/*", PUBLIC_SHARE_TEST_RESPONSE]],
    readyTestId: TEST_ID.shareComparison,
    readyAlsoTestId: TEST_ID.shareComparisonImage,
  },
  {
    // The link a new account arrives through (ADR-075). It renders outside the
    // shell like the share page, so this case is its only layout gate: no
    // password is on it — the reveal is a click, not a render.
    name: "invite",
    story: "views/InviteView/Routed",
    props: { initialRoute: "/invite/gallery-invite-token" },
    routes: [
      ["**/api/v1/public/user-invites/*", PUBLIC_INVITE_PREVIEW_RESPONSE],
    ],
    readyTestId: TEST_ID.inviteReveal,
  },
  {
    name: "trends",
    story: "views/TrendsView/Routed",
    props: { initialRoute: "/projects/checkout-ui/trends" },
    routes: [
      [PROJECT_DETAILS_GLOB, PROJECT_CHECKOUT_UI_RESPONSE],
      ["**/api/v1/projects/*/trends*", TRENDS_RESPONSE],
    ],
    readyTestId: TEST_ID.trendsComparisons,
  },
];
