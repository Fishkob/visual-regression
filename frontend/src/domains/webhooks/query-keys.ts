export const webhookQueryKeys = {
  all: () => ["webhooks"] as const,
  // Endpoints are project-scoped: another project has its own list and log.
  list: (projectName: string) =>
    [...webhookQueryKeys.all(), projectName, "list"] as const,
  // The prefix every per-endpoint delivery read shares, so invalidating the log
  // of an endpoint (or of all of them) never collides with the list.
  deliveriesAll: (projectName: string) =>
    [...webhookQueryKeys.all(), projectName, "deliveries"] as const,
  deliveries: (projectName: string, endpointId: string) =>
    [...webhookQueryKeys.deliveriesAll(projectName), endpointId] as const,
} as const;
