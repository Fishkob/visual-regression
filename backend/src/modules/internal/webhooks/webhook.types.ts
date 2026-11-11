export const WEBHOOK_SUBSCRIPTION_EVENTS = [
  'review.requested',
  'comparison.approved',
  'review.assigned',
  'review.comment',
  'job.failed',
] as const;

export type WebhookSubscriptionEvent =
  (typeof WEBHOOK_SUBSCRIPTION_EVENTS)[number];

// `test` is a synthetic delivery the settings UI triggers; it is never part of
// an endpoint's subscription list.
export type WebhookEvent = WebhookSubscriptionEvent | 'test';

export interface WebhookVariant {
  viewport: string;
  browser: string;
  environment: string;
}

export interface WebhookPayload {
  event: WebhookEvent;
  occurredAt: string;
  project: { name: string };
  test?: { name: string; kind: string };
  branch: string | null;
  variant?: WebhookVariant;
  comparison?: {
    id: string;
    mismatchPixelCount: number;
    kind: string;
  };
  approvedBy?: string;
  reason?: string;
  note?: string;
  assignee?: string;
  dueAt?: string | null;
  comment?: { author: string; body: string; comparisonId: string | null };
  // A comparison that died in the worker never gets a comparison row, so its id
  // and mismatch count are absent; the job's id, spent budget and last error are
  // what the receiver needs to find the run and the DLQ entry.
  job?: { id: string; error: string; attempts: number; maxAttempts: number };
  // `run` is present only for events that name a run (job.failed); the review
  // link is the stable one every consumer uses.
  links: { review: string; run?: string };
}

export interface WebhookEndpointRow {
  id: string;
  projectId: string;
  url: string;
  secret: string;
  events: string[];
  format: 'json' | 'slack';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryRow {
  id: string;
  endpointId: string;
  event: string;
  payload: unknown;
  status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  nextAttemptAt: Date | null;
  responseStatus: number | null;
  lastError: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  deliveredAt: Date | null;
}
