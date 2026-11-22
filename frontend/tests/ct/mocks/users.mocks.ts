import type { UsersControllerListResponses } from "@sdk/models/UsersControllerListResponses.gen";

// The account list the team member picker reads. The ids are the ones
// `teams.mocks` names as members, so a preselected member is a checkbox that
// exists instead of an id nothing renders.
export const USERS_GLOB = "**/api/v1/users";

export const USERS_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "u-1",
      username: "alice",
      role: "MEMBER",
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: "2026-09-01T09:00:00.000Z",
    },
    {
      id: "u-2",
      username: "bob",
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: "2026-09-02T09:00:00.000Z",
    },
    {
      id: "u-3",
      username: "carol",
      role: "VIEWER",
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: "2026-09-03T09:00:00.000Z",
    },
  ] satisfies UsersControllerListResponses[200]),
};

// A fresh installation: the admin is the only account, so there is nobody to put
// into a team. The picker has to say that instead of showing an empty list.
export const USERS_ONE_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "u-admin",
      username: "admin",
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
      deactivatedAt: null,
      createdBy: null,
      createdAt: "2026-09-01T09:00:00.000Z",
    },
  ] satisfies UsersControllerListResponses[200]),
};
