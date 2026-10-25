import { WebhookSender } from '@internal/webhooks/webhook-sender.service';
import type {
  WebhookDeliveryRow,
  WebhookEndpointRow,
} from '@internal/webhooks/webhook.types';

describe('WebhookSender', () => {
  let sender: WebhookSender;
  let fetchMock: ReturnType<typeof vi.fn>;

  const endpoint = {
    id: 'wh-1',
    projectId: 'project-1',
    url: 'https://hooks.example.com/x',
    secret: 'whsec_test',
    events: ['review.requested'],
    format: 'json',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies WebhookEndpointRow;

  const delivery = {
    id: 'del-1',
    endpointId: 'wh-1',
    event: 'review.requested',
    payload: {
      event: 'review.requested',
      project: { name: 'shop' },
      test: { name: 'checkout', kind: 'image' },
      links: { review: 'https://vrt.example.com/projects/shop/tests/checkout' },
    },
    status: 'PROCESSING',
    attempts: 0,
    nextAttemptAt: null,
    responseStatus: null,
    lastError: null,
    createdAt: new Date(),
    deliveredAt: null,
  } satisfies WebhookDeliveryRow;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    sender = new WebhookSender();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the JSON payload with signature headers', async () => {
    fetchMock.mockResolvedValue(
      new Response('ok', { status: 200 }),
    );

    const result = await sender.send(endpoint, delivery);

    expect(result).toEqual({ ok: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/x');
    expect(init.method).toBe('POST');
    expect(init.headers['x-vrt-event']).toBe('review.requested');
    expect(init.headers['x-vrt-delivery-id']).toBe('del-1');
    expect(init.headers['x-vrt-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toEqual(delivery.payload);
  });

  it('wraps the summary in Slack text format', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    await sender.send({ ...endpoint, format: 'slack' }, delivery);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      text: expect.stringContaining('shop / checkout needs review'),
    });
  });

  it('reports a non-2xx response with the response body', async () => {
    fetchMock.mockResolvedValue(
      new Response('nope', { status: 500 }),
    );

    const result = await sender.send(endpoint, delivery);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toContain('HTTP 500');
    expect(result.error).toContain('nope');
  });

  it('reports a network error as a failed attempt', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await sender.send(endpoint, delivery);

    expect(result).toEqual({
      ok: false,
      error: 'connect ECONNREFUSED',
    });
  });
});
