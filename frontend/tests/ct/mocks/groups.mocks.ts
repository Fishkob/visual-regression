export const GROUPS_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    {
      id: "g2",
      name: "Admin",
      createdAt: "2026-10-20T10:00:00.000Z",
      projectCount: 1,
    },
    {
      id: "g1",
      name: "Checkout",
      createdAt: "2026-10-20T10:00:00.000Z",
      projectCount: 2,
    },
  ]),
};

export const GROUPS_EMPTY_RESPONSE = {
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([]),
};
