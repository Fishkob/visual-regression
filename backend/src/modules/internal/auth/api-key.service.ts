import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DomainError } from '@common/domain/domain-error';
import {
  AuthRepository,
  type ApiKeyRetirement,
  type ApiKeyRow,
  type CreateApiKeyInput,
} from './auth.repository';
import { hashToken } from './token-hash';

// API keys are shown once in plaintext at creation; only the SHA-256 hash is
// persisted. The raw key itself is 256 bits of base64url entropy.
const API_KEY_BYTES = 32;
// The trailing characters are kept in the clear so a key can be recognized in a
// list ("…7f3a") without ever being recoverable from the database.
const KEY_HINT_LENGTH = 4;
// lastUsedAt is audit metadata, not a security control: writing it on every
// authenticated request would turn one read into a read + write on the hot path
// of every CI upload. Hourly resolution is enough to spot a dead key.
const LAST_USED_WRITE_INTERVAL_MS = 60 * 60 * 1000;
const ROTATION_REASON = 'rotated';

export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

// The list-facing shape: everything the dashboard needs to decide what to do
// with a key, and nothing that could reconstruct it (no hash, no raw key).
export interface ApiKeyView {
  id: string;
  name: string;
  keyHint: string | null;
  createdBy: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  replacedById: string | null;
  status: ApiKeyStatus;
}

export interface CreateApiKeyOptions {
  name: string;
  expiresInDays?: number | null;
  createdBy?: string | null;
}

export interface RotateApiKeyOptions {
  // How long the predecessor keeps working after the rotation, so a pipeline
  // can be updated without a window in which nothing authenticates.
  graceMinutes?: number;
  // Three-way: undefined inherits the predecessor's remaining lifetime, null
  // grants a key that never expires, a number sets that lifetime.
  expiresInDays?: number | null;
  createdBy?: string | null;
}

export interface IssuedApiKey {
  id: string;
  name: string;
  rawKey: string;
  keyHint: string;
  expiresAt: Date | null;
}

export interface RotatedApiKey extends IssuedApiKey {
  replacesId: string;
  replacesKeyHint: string | null;
  graceEndsAt: Date | null;
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly repo: AuthRepository) {}

  async createKey(options: CreateApiKeyOptions): Promise<IssuedApiKey> {
    const issued = this.generate();
    const input = this.toInput(issued, options);
    const row = await this.repo.createApiKey(input);
    return {
      id: row.id,
      name: row.name,
      rawKey: issued.rawKey,
      keyHint: input.keyHint,
      expiresAt: input.expiresAt,
    };
  }

  async listKeys(): Promise<ApiKeyView[]> {
    const rows = await this.repo.listApiKeys();
    const now = Date.now();
    return rows.map((row) => this.toView(row, now));
  }

  // Idempotent by design: revoking an already-revoked key reports the existing
  // state instead of failing, so a double click or a retried request cannot
  // flip the result of an operation that already happened.
  async revokeKey(id: string, reason?: string | null): Promise<ApiKeyView> {
    const current = await this.findOrFail(id);
    if (current.revokedAt) return this.toView(current);
    const trimmed = reason?.trim() ?? '';
    const row = await this.repo.revokeApiKey(
      id,
      new Date(),
      trimmed.length > 0 ? trimmed : null,
    );
    return this.toView(row);
  }

  // Only a key that never authenticated may be deleted outright: once it has
  // used the API, the row is the only record of which CI job that was, so it is
  // revoked (kept) rather than deleted.
  async deleteKey(id: string): Promise<{ success: true }> {
    const current = await this.findOrFail(id);
    if (current.lastUsedAt) {
      throw new DomainError(
        'A key that has been used must be revoked instead of deleted',
        'CONFLICT',
      );
    }
    await this.repo.deleteApiKey(id);
    return { success: true };
  }

  async rotateKey(
    id: string,
    options: RotateApiKeyOptions = {},
  ): Promise<RotatedApiKey> {
    const current = await this.findOrFail(id);
    const now = new Date();
    if (!this.isActive(current, now.getTime())) {
      throw new DomainError(
        'Only an active API key can be rotated',
        'INVALID_STATE',
      );
    }

    const issued = this.generate();
    const graceMinutes = options.graceMinutes ?? 0;
    const graceEndsAt =
      graceMinutes > 0
        ? new Date(now.getTime() + graceMinutes * 60 * 1000)
        : null;
    const retirement: ApiKeyRetirement = {
      revokedAt: graceEndsAt ? null : now,
      expiresAt: graceEndsAt,
      revokedReason: ROTATION_REASON,
    };

    const input = this.toInput(
      issued,
      {
        name: current.name,
        createdBy: options.createdBy ?? null,
        // A successor inherits the predecessor's remaining lifetime unless the
        // caller asks for an explicit one — rotating must not silently grant a
        // key that never expires to a key that did. Only an explicit null turns
        // the expiry off, so "inherit" and "never" stay distinguishable.
        expiresInDays:
          options.expiresInDays === undefined
            ? this.remainingDays(current, now)
            : options.expiresInDays,
      },
      now,
    );
    const row = await this.repo.replaceApiKey(input, id, retirement);

    return {
      id: row.id,
      name: row.name,
      rawKey: issued.rawKey,
      keyHint: input.keyHint,
      expiresAt: input.expiresAt,
      replacesId: current.id,
      replacesKeyHint: current.keyHint,
      graceEndsAt,
    };
  }

  // Resolves a raw key to its stored id + name if it is active (not revoked,
  // not expired). The guard uses the id as the per-key rate-limit identity and
  // the name as the authenticated identity for key-authenticated requests.
  async resolveApiKey(
    rawKey: string,
  ): Promise<{ id: string; name: string } | null> {
    const row = await this.repo.findApiKeyByHash(hashToken(rawKey));
    if (!row || !this.isActive(row, Date.now())) return null;
    await this.recordUsage(row);
    return { id: row.id, name: row.name };
  }

  private generate(): { rawKey: string; keyHint: string; keyHash: string } {
    const rawKey = randomBytes(API_KEY_BYTES).toString('base64url');
    return {
      rawKey,
      keyHint: rawKey.slice(-KEY_HINT_LENGTH),
      keyHash: hashToken(rawKey),
    };
  }

  private toInput(
    issued: { keyHash: string; keyHint: string },
    options: CreateApiKeyOptions,
    now = new Date(),
  ): CreateApiKeyInput {
    const days = options.expiresInDays;
    return {
      name: options.name,
      keyHash: issued.keyHash,
      keyHint: issued.keyHint,
      createdBy: options.createdBy ?? null,
      expiresAt: days && days > 0 ? this.plusDays(now, days) : null,
    };
  }

  private async findOrFail(id: string): Promise<ApiKeyRow> {
    const row = await this.repo.findApiKeyById(id);
    if (!row) throw new DomainError('API key not found', 'NOT_FOUND');
    return row;
  }

  private isActive(row: ApiKeyRow, now: number): boolean {
    if (row.revokedAt) return false;
    return !row.expiresAt || row.expiresAt.getTime() > now;
  }

  private toView(row: ApiKeyRow, now = Date.now()): ApiKeyView {
    return {
      id: row.id,
      name: row.name,
      keyHint: row.keyHint,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      revokedReason: row.revokedReason,
      replacedById: row.replacedById,
      status: row.revokedAt
        ? 'revoked'
        : this.isActive(row, now)
          ? 'active'
          : 'expired',
    };
  }

  // Usage recording is best-effort: an audit write must never turn a valid key
  // into a 500, so a failed update is swallowed rather than propagated.
  private async recordUsage(row: ApiKeyRow): Promise<void> {
    const now = Date.now();
    if (
      row.lastUsedAt &&
      now - row.lastUsedAt.getTime() < LAST_USED_WRITE_INTERVAL_MS
    ) {
      return;
    }
    try {
      await this.repo.touchApiKeyLastUsed(row.id, new Date(now));
    } catch {
      // Intentionally ignored — see comment above.
    }
  }

  private plusDays(from: Date, days: number): Date {
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private remainingDays(current: ApiKeyRow, now: Date): number | null {
    if (!current.expiresAt) return null;
    const remaining = current.expiresAt.getTime() - now.getTime();
    if (remaining <= 0) return null;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }
}
