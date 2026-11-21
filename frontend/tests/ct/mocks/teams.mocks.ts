import type { TeamsControllerListResponses } from "@sdk/models/TeamsControllerListResponses.gen";

// The settings page renders "who owns this project", so its team read is
// answered here instead of per spec. `checkout-ui` is owned by Checkout in this
// fixture, and Platform owns nothing — both states a spec wants to see.
//
// `billing-api` is the project of the project-settings fixture set and it is
// deliberately *not* owned by a team: the rendered answer is the shared state.
export const TEAMS_GLOB = "**/api/v1/teams";

export const TEAMS_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "team-checkout",
      name: "Checkout",
      createdBy: "admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      members: [{ userId: "u-1", username: "alice", role: "MEMBER" }],
      projects: [],
    },
    {
      id: "team-platform",
      name: "Platform",
      createdBy: "admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      members: [],
      projects: [
        { id: "p-2", name: "design-system" },
        { id: "p-3", name: "shared-lib" },
      ],
    },
  ] satisfies TeamsControllerListResponses[200]),
};

// The same two teams, with `checkout-ui` owned by Checkout. The assignment flow
// needs a project that already has an owner — the default fixture keeps it
// shared so the settings baseline photographs that state.
export const TEAMS_WITH_PROJECT_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "team-checkout",
      name: "Checkout",
      createdBy: "admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      members: [{ userId: "u-1", username: "alice", role: "MEMBER" }],
      projects: [{ id: "p-1", name: "checkout-ui" }],
    },
    {
      id: "team-platform",
      name: "Platform",
      createdBy: "admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      members: [],
      projects: [{ id: "p-2", name: "design-system" }],
    },
  ] satisfies TeamsControllerListResponses[200]),
};

export const TEAMS_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([] satisfies TeamsControllerListResponses[200]),
};
