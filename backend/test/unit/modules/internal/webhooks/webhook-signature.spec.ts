import { signWebhookDelivery } from '@internal/webhooks/webhook-signature';

describe('signWebhookDelivery', () => {
  it('signs the timestamp and body with the endpoint secret', () => {
    const signature = signWebhookDelivery(
      'whsec_test',
      1_700_000_000,
      '{"a":1}',
    );

    expect(signature).toBe(
      'sha256=38877139021993b830af32feea6e18a8da83eb2f6e49ee50bd9e4cf4ca4d3789',
    );
  });
});
