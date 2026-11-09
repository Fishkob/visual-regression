import { hkdfSync, randomBytes } from 'node:crypto';

// How long an invite link works. Long enough for an admin to hand it over out of
// band (chat, ticket, onboarding mail), short enough that the copy left behind
// in that channel stops mattering.
export const INVITE_TTL_DAYS = 7;

const TOKEN_BYTES = 32;
// 15 bytes is exactly 20 base64url characters — the password's length, and 120
// bits out of the token's 256.
const PASSWORD_BYTES = 15;
// Domain separation for the derivation below. Both strings are part of the
// stored contract: changing either invalidates every outstanding link (and,
// since the password is derived rather than stored, every password issued
// through one).
const PASSWORD_SALT = 'vrt/user-invite/salt/v1';
const PASSWORD_INFO = 'vrt/user-invite/password/v1';

export type InviteStatus = 'pending' | 'used' | 'expired';

export interface InviteState {
  expiresAt: Date;
  consumedAt: Date | null;
  user: { isActive: boolean; mustChangePassword: boolean };
}

export function mintInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

// The temporary password is DERIVED from the invite token instead of stored next
// to it (ADR-075). The link is the only place the token exists in clear, and the
// database holds just its SHA-256, so a dump yields neither the link nor the
// password.
//
// HKDF, and deliberately not a slow password KDF. The input is a random 256-bit
// token, not a secret a human chose, so there is nothing to brute-force; a
// memory-hard hash here would only make one reveal cost a KDF's worth of memory.
// The value that protects the credential at rest is the account's scrypt hash,
// which is where `issueCredential` puts this. Whoever holds the token can
// compute the password — that is what the link is for — but the stored token
// hash cannot be turned into it without inverting SHA-256 first.
export function invitePassword(token: string): string {
  return Buffer.from(
    hkdfSync('sha256', token, PASSWORD_SALT, PASSWORD_INFO, PASSWORD_BYTES),
  ).toString('base64url');
}

export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// A link stops being "pending" for three reasons, and only the first is a
// property of the link itself: it was revealed, it expired, or the credential it
// carries is no longer outstanding — the account was deactivated, or the user
// already changed the password, which is what the whole flow exists to force.
export function inviteStatus(
  invite: InviteState,
  now = new Date(),
): InviteStatus {
  if (invite.consumedAt) return 'used';
  if (!invite.user.isActive || !invite.user.mustChangePassword) return 'used';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}
