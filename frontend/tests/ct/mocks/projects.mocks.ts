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
      },
      {
        id: "2",
        name: "dashboard-ui",
        createdAt: "2025-11-25T18:28:51.174Z",
        pending: false,
      },
      {
        id: "3",
        name: "admin-ui",
        createdAt: "2025-11-25T18:28:51.416Z",
        pending: true,
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

export const PROJECT_CHECKOUT_UI_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    id: "cmiewt8xi0008q35zr1ugreta",
    name: "checkout-ui",
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
