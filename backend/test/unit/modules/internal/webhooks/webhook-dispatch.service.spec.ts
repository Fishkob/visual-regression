import type { Mocked } from 'vitest';
import { WebhookDispatchService } from '@internal/webhooks/webhook-dispatch.service';
import { WebhookContextRepository } from '@internal/webhooks/webhook-context.repository';
import { WebhookDeliveryRepository } from '@internal/webhooks/webhook-delivery.repository';
import { WebhookEndpointRepository } from '@internal/webhooks/webhook-endpoint.repository';
import type { AppConfigService } from '@config/app-config.service';
import { createMock } from '@test/utils/create-mock';

describe('WebhookDispatchService', () => {
  let service: WebhookDispatchService;
  let endpoints: Mocked<WebhookEndpointRepository>;
  let deliveries: Mocked<WebhookDeliveryRepository>;
  let context: Mocked<WebhookContextRepository>;

  const variant = {
    viewport: '1920x1080',
    browser: 'chrome',
    environment: 'staging',
  };

  beforeEach(() => {
    endpoints = createMock<WebhookEndpointRepository>();
    deliveries = createMock<WebhookDeliveryRepository>();
    deliveries.createMany.mockResolvedValue(0);
    deliveries.create.mockResolvedValue({} as never);
    context = createMock<WebhookContextRepository>();
    context.findTestContext.mockResolvedValue({
      projectId: 'project-1',
      projectName: 'shop',
      testName: 'checkout',
      kind: 'image',
      branchName: 'feature/x',
    });
    context.findProjectByName.mockResolvedValue({
      id: 'project-1',
      name: 'shop',
    });

    service = new WebhookDispatchService(endpoints, deliveries, context, {
      appPublicUrl: 'https://vrt.example.com/',
    } as AppConfigService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueues review.requested for every subscribed endpoint', async () => {
    endpoints.findActiveForProjectEvent.mockResolvedValue([
      { id: 'wh-1' } as never,
      { id: 'wh-2' } as never,
    ]);
    deliveries.createMany.mockResolvedValue(2);

    const count = await service.enqueueReviewRequested({
      testId: 'test-1',
      comparisonId: 'cmp-1',
      kind: 'image',
      variant,
      mismatchPixelCount: 42,
    });

    expect(count).toBe(2);
    expect(endpoints.findActiveForProjectEvent).toHaveBeenCalledWith(
      'project-1',
      'review.requested',
    );
    expect(deliveries.createMany).toHaveBeenCalledWith(
      ['wh-1', 'wh-2'],
      'review.requested',
      expect.objectContaining({
        event: 'review.requested',
        project: { name: 'shop' },
        test: { name: 'checkout', kind: 'image' },
        branch: 'feature/x',
        variant,
        comparison: {
          id: 'cmp-1',
          mismatchPixelCount: 42,
          kind: 'image',
        },
        links: {
          review:
            'https://vrt.example.com/projects/shop/tests/checkout?branch=feature%2Fx',
        },
      }),
    );
  });

  it('writes nothing when the project has no subscribed endpoint', async () => {
    endpoints.findActiveForProjectEvent.mockResolvedValue([]);

    const count = await service.enqueueComparisonApproved({
      projectName: 'shop',
      testName: 'checkout',
      branchName: null,
      kind: 'pdf',
      variant,
      comparisonId: 'cmp-2',
      mismatchPixelCount: 1,
      approvedBy: 'jane',
    });

    expect(count).toBe(0);
    expect(deliveries.createMany).not.toHaveBeenCalled();
  });

  it('enqueues comparison.approved with the approval actor', async () => {
    endpoints.findActiveForProjectEvent.mockResolvedValue([
      { id: 'wh-1' } as never,
    ]);
    deliveries.createMany.mockResolvedValue(1);

    await service.enqueueComparisonApproved({
      projectName: 'shop',
      testName: 'checkout',
      branchName: null,
      kind: 'image',
      variant,
      comparisonId: 'cmp-2',
      mismatchPixelCount: 7,
      approvedBy: 'jane',
    });

    expect(deliveries.createMany).toHaveBeenCalledWith(
      ['wh-1'],
      'comparison.approved',
      expect.objectContaining({
        event: 'comparison.approved',
        approvedBy: 'jane',
        links: {
          review: 'https://vrt.example.com/projects/shop/tests/checkout',
        },
      }),
    );
  });

  it('carries the optional approval reason and note', async () => {
    endpoints.findActiveForProjectEvent.mockResolvedValue([
      { id: 'wh-1' } as never,
    ]);
    deliveries.createMany.mockResolvedValue(1);

    await service.enqueueComparisonApproved({
      projectName: 'shop',
      testName: 'checkout',
      branchName: null,
      kind: 'image',
      variant,
      comparisonId: 'cmp-2',
      mismatchPixelCount: 7,
      approvedBy: 'jane',
      reason: 'FLAKE',
      note: 'Flaky promo banner',
    });

    expect(deliveries.createMany).toHaveBeenCalledWith(
      ['wh-1'],
      'comparison.approved',
      expect.objectContaining({
        reason: 'FLAKE',
        note: 'Flaky promo banner',
      }),
    );
  });

  it('omits reason and note when the approval carries none', async () => {
    endpoints.findActiveForProjectEvent.mockResolvedValue([
      { id: 'wh-1' } as never,
    ]);
    deliveries.createMany.mockResolvedValue(1);

    await service.enqueueComparisonApproved({
      projectName: 'shop',
      testName: 'checkout',
      branchName: null,
      kind: 'image',
      variant,
      comparisonId: 'cmp-2',
      mismatchPixelCount: 7,
      approvedBy: 'jane',
      reason: null,
      note: null,
    });

    const payload = deliveries.createMany.mock.calls[0][2];
    expect(payload).not.toHaveProperty('reason');
    expect(payload).not.toHaveProperty('note');
  });

  it('creates a synthetic test delivery for one endpoint', async () => {
    await service.enqueueTestEvent({
      endpointId: 'wh-1',
      projectName: 'shop',
    });

    expect(deliveries.create).toHaveBeenCalledWith(
      'wh-1',
      'test',
      expect.objectContaining({
        event: 'test',
        project: { name: 'shop' },
        links: { review: 'https://vrt.example.com/projects' },
      }),
    );
  });

  it('skips the outbox when the test context is gone', async () => {
    context.findTestContext.mockResolvedValue(null);

    await expect(
      service.enqueueReviewRequested({
        testId: 'gone',
        comparisonId: 'cmp-1',
        kind: 'image',
        variant,
        mismatchPixelCount: 1,
      }),
    ).resolves.toBe(0);
    expect(deliveries.createMany).not.toHaveBeenCalled();
  });
});
