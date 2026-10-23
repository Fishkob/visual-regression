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
  }),
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
  }),
};

export const PROJECT_CHECKOUT_UI_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "cmiewt8xi0008q35zr1ugreta",
    name: "checkout-ui",
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
        latestStatus: null,
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Safari",
          environment: "staging",
        },
        latestStatus: null,
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1366x768",
          browser: "Firefox",
          environment: "staging",
        },
        latestStatus: null,
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Firefox",
          environment: "staging",
        },
        latestStatus: null,
      },
      {
        name: "checkout-flow",
        kind: "image",
        variant: {
          viewport: "1366x768",
          browser: "Chrome",
          environment: "staging",
        },
        latestStatus: null,
      },
      {
        name: "login-form",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Safari",
          environment: "staging",
        },
        latestStatus: null,
      },
      {
        name: "login-form",
        kind: "image",
        variant: {
          viewport: "1366x768",
          browser: "Firefox",
          environment: "staging",
        },
        latestStatus: null,
      },
      {
        name: "login-form",
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Firefox",
          environment: "staging",
        },
        latestStatus: null,
      },
    ],
  }),
};

export const PROJECT_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "cmiewt8xi0008q35zr1ugreta",
    name: "checkout-ui",
    visualTests: [],
  }),
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
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 157,
        mismatchPageCount: null,
        createdAt: "2026-10-20T10:00:00.000Z",
      },
      {
        comparisonId: "c2",
        projectName: "admin-ui",
        groupId: null,
        groupName: null,
        testName: "users",
        kind: "pdf",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        createdAt: "2026-10-21T10:00:00.000Z",
      },
    ],
    meta: { total: 2 },
  }),
};

export const REVIEW_INBOX_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ data: [], meta: { total: 0 } }),
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
        kind: "image",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 157,
        mismatchPageCount: null,
        createdAt: "2026-10-20T10:00:00.000Z",
      },
      {
        comparisonId: "c3",
        projectName: "checkout-ui",
        groupId: "g1",
        groupName: "Checkout",
        testName: "checkout-pdf",
        kind: "pdf",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        createdAt: "2026-10-22T10:00:00.000Z",
      },
      {
        comparisonId: "c2",
        projectName: "admin-ui",
        groupId: null,
        groupName: null,
        testName: "users",
        kind: "pdf",
        variant: {
          viewport: "1920x1080",
          browser: "Chrome",
          environment: "staging",
        },
        mismatchPixelCount: 0,
        mismatchPageCount: 2,
        createdAt: "2026-10-21T10:00:00.000Z",
      },
    ],
    meta: { total: 3 },
  }),
};
