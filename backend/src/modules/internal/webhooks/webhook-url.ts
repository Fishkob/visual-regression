import { isIP } from 'node:net';
import { DomainError } from '@common/domain/domain-error';

// SSRF guard for admin-configured endpoint URLs. The product runs in private
// networks, so RFC1918 addresses are legitimate targets; the guard blocks the
// addresses that turn a webhook into a cloud-metadata or loopback probe:
// localhost, 0.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16 (incl. the metadata
// service), ::1, fe80::/10 and IPv4-mapped forms of those. DNS rebinding
// remains a residual risk (the URL is admin-controlled; the dispatcher uses
// plain fetch).
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

function blockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 100 && b === 64 && parts[2] === 100 && parts[3] === 200)
  );
}

function blockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')) {
    return true;
  }
  if (normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return blockedIpv4(mapped[1]);
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost')) return true;
  if (isIP(host) === 4) return blockedIpv4(host);
  if (isIP(host) === 6) return blockedIpv6(host);
  return false;
}

export function assertSafeWebhookUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DomainError('Webhook URL is not a valid URL', 'BAD_REQUEST');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DomainError('Webhook URL must use http or https', 'BAD_REQUEST');
  }
  if (url.username || url.password) {
    throw new DomainError(
      'Webhook URL must not contain credentials',
      'BAD_REQUEST',
    );
  }
  if (isBlockedHostname(url.hostname)) {
    throw new DomainError(
      `Webhook URL host "${url.hostname}" is not allowed`,
      'BAD_REQUEST',
    );
  }
  return url;
}
