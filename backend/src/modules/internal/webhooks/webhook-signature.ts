import { createHmac } from 'node:crypto';

// The consumer verifies `X-VRT-Signature` over `${timestamp}.${body}`. Keeping
// the signed string in one function means the sender and any future verifier
// helper cannot drift on the separator.
export function signWebhookDelivery(
  secret: string,
  timestamp: number,
  body: string,
): string {
  return `sha256=${createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`;
}
