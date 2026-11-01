import type { BranchesControllerListResponses } from "@sdk/models/BranchesControllerListResponses.gen";
import type { ProjectsControllerGetOneProjectResponses } from "@sdk/models/ProjectsControllerGetOneProjectResponses.gen";
import type { ProjectsControllerGetProjectsWithPendingFlagResponses } from "@sdk/models/ProjectsControllerGetProjectsWithPendingFlagResponses.gen";
import type { ReviewInboxControllerGetPendingResponses } from "@sdk/models/ReviewInboxControllerGetPendingResponses.gen";

export const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

export const PROJECTS_PENDING_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    data: [
      {
        id: "1",
        name: "checkout-ui",
        createdAt: "2025-11-25T18:28:50.934Z",
        pending: true,
        groupId: "g1",
        groupName: "Checkout",
        pendingCount: 1,
        testCount: 3,
      },
      {
        id: "2",
        name: "dashboard-ui",
        createdAt: "2025-11-25T18:28:51.174Z",
        pending: false,
        groupId: "g1",
        groupName: "Checkout",
        pendingCount: 0,
        testCount: 2,
      },
      {
        id: "3",
        name: "admin-ui",
        createdAt: "2025-11-25T18:28:51.416Z",
        pending: true,
        groupId: null,
        groupName: null,
        pendingCount: 2,
        testCount: 4,
      },
    ],
    meta: {
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  } satisfies ProjectsControllerGetProjectsWithPendingFlagResponses[200]),
};

export const PROJECTS_PENDING_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    data: [],
    meta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  } satisfies ProjectsControllerGetProjectsWithPendingFlagResponses[200]),
};

export const PROJECT_CHECKOUT_UI_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "cmiewt8xi0008q35zr1ugreta",
    name: "checkout-ui",
    branchName: "main",
    defaultBranchName: "main",
    groupId: "g1",
    groupName: "Checkout",
    visualTests: [
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        latestStatus: "PENDING_APPROVAL",
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1366x768",
          browser: "Safari",
          environment: "staging",
        },
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Safari",
          environment: "staging",
        },
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1366x768",
          browser: "Firefox",
          environment: "staging",
        },
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Firefox",
          environment: "staging",
        },
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1366x768",
          browser: "Chrome",
          environment: "staging",
        },
      },
      {
        name: "login-form",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Safari",
          environment: "staging",
        },
      },
      {
        name: "login-form",
        kind: "image",
        variant: {
          viewport: "1366x768",
          browser: "Firefox",
          environment: "staging",
        },
      },
      {
        name: "login-form",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Firefox",
          environment: "staging",
        },
      },
    ],
  } satisfies ProjectsControllerGetOneProjectResponses[200]),
};

// The branch-scoped read for `feature/checkout-v2`: one variant the branch owns
// and one inherited from its target. Only an inherited origin renders the
// inherited badge and suppresses the row actions, so both rows are needed.
export const PROJECT_CHECKOUT_UI_BRANCH_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "cmiewt8xi0008q35zr1ugreta",
    name: "checkout-ui",
    branchName: "feature/checkout-v2",
    defaultBranchName: "main",
    groupId: "g1",
    groupName: "Checkout",
    visualTests: [
      {
        name: "checkout-flow",
        kind: "image",
        origin: "branch",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        latestStatus: "PENDING_APPROVAL",
      },
      {
        name: "login-form",
        kind: "image",
        origin: "inherited",
        inheritedFrom: "main",
        variant: {
          viewport: "1366x768",
          browser: "Firefox",
          environment: "staging",
        },
        latestStatus: "UNCHANGED",
      },
    ],
  } satisfies ProjectsControllerGetOneProjectResponses[200]),
};

export const PROJECT_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "cmiewt8xi0008q35zr1ugreta",
    name: "checkout-ui",
    visualTests: [],
  } satisfies ProjectsControllerGetOneProjectResponses[200]),
};

export const REVIEW_INBOX_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    data: [
      {
        comparisonId: "c1",
        projectName: "checkout-ui",
        groupId: "g1",
        groupName: "Checkout",
        testName: "checkout-flow",
        branchName: "main",
        isDefaultBranch: true,
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 157,
        mismatchPageCount: null,
        createdAt: "2026-10-20T10:00:00.000Z",
        projectPendingCount: 1,
        projectBranchCount: 1,
      },
      {
        comparisonId: "c2",
        projectName: "admin-ui",
        groupId: null,
        groupName: null,
        testName: "users",
        branchName: "main",
        isDefaultBranch: true,
        kind: "pdf",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        createdAt: "2026-10-21T10:00:00.000Z",
        projectPendingCount: 1,
        projectBranchCount: 1,
      },
    ],
    meta: {
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  } satisfies ReviewInboxControllerGetPendingResponses[200]),
};

export const REVIEW_INBOX_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    data: [],
    meta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  } satisfies ReviewInboxControllerGetPendingResponses[200]),
};

export const REVIEW_INBOX_MULTI_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    data: [
      {
        comparisonId: "c1",
        projectName: "checkout-ui",
        groupId: "g1",
        groupName: "Checkout",
        testName: "checkout-flow",
        branchName: "main",
        isDefaultBranch: true,
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 157,
        mismatchPageCount: null,
        createdAt: "2026-10-20T10:00:00.000Z",
        projectPendingCount: 2,
        projectBranchCount: 1,
      },
      {
        comparisonId: "c3",
        projectName: "checkout-ui",
        groupId: "g1",
        groupName: "Checkout",
        testName: "checkout-pdf",
        branchName: "main",
        isDefaultBranch: true,
        kind: "pdf",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        createdAt: "2026-10-22T10:00:00.000Z",
        projectPendingCount: 2,
        projectBranchCount: 1,
      },
      {
        comparisonId: "c2",
        projectName: "admin-ui",
        groupId: null,
        groupName: null,
        testName: "users",
        branchName: "main",
        isDefaultBranch: true,
        kind: "pdf",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        createdAt: "2026-10-21T10:00:00.000Z",
        projectPendingCount: 1,
        projectBranchCount: 1,
      },
    ],
    meta: {
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  } satisfies ReviewInboxControllerGetPendingResponses[200]),
};

// The branch list every project-detail render asks for. Without it the switcher
// silently does not render (the request fails and the view treats "no data" as
// "no branches"), which is exactly the state the CT/quality suites used to
// baseline.
export const BRANCHES_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      name: "main",
      isDefault: true,
      isArchived: false,
      targetBranchName: null,
      testCount: 9,
      pendingCount: 2,
      createdAt: "2026-10-01T10:00:00.000Z",
    },
    {
      name: "feature/checkout-v2",
      isDefault: false,
      isArchived: false,
      targetBranchName: "main",
      testCount: 3,
      pendingCount: 1,
      createdAt: "2026-10-20T10:00:00.000Z",
    },
    {
      name: "feature/checkout-v2-child",
      isDefault: false,
      isArchived: false,
      targetBranchName: "feature/checkout-v2",
      testCount: 1,
      pendingCount: 0,
      createdAt: "2026-10-21T10:00:00.000Z",
    },
  ] satisfies BranchesControllerListResponses[200]),
};

// Two branches in one project: the badge shows for the non-default one and the
// project section's review button only covers the branch its pass starts on.
export const REVIEW_INBOX_BRANCHES_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    data: [
      {
        comparisonId: "cb1",
        projectName: "checkout-ui",
        groupId: "g1",
        groupName: "Checkout",
        testName: "checkout-flow",
        kind: "image",
        branchName: "main",
        isDefaultBranch: true,
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 157,
        mismatchPageCount: null,
        createdAt: "2026-10-20T10:00:00.000Z",
        projectPendingCount: 1,
        projectBranchCount: 2,
      },
      {
        comparisonId: "cb2",
        projectName: "checkout-ui",
        groupId: "g1",
        groupName: "Checkout",
        testName: "checkout-pay",
        kind: "image",
        branchName: "feature/checkout-v2",
        isDefaultBranch: false,
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 12,
        mismatchPageCount: null,
        createdAt: "2026-10-22T10:00:00.000Z",
        projectPendingCount: 1,
        projectBranchCount: 2,
      },
    ],
    meta: {
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  } satisfies ReviewInboxControllerGetPendingResponses[200]),
};
