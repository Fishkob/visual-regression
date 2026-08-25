import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuthRepository } from './auth.repository';
import { hashToken } from './token-hash';

// API keys are shown once in plaintext at creation; only the SHA-256 hash is
// persisted. The raw key itself is 256 bits of base64url entropy.
const API_KEY_BYTES = 32;

@Injectable()
export class ApiKeyService {
  constructor(private readonly repo: AuthRepository) {}

  async createKey(name: string): Promise<{ id: string; rawKey: string }> {
    const rawKey = randomBytes(API_KEY_BYTES).toString('base64url');
    const keyHash = hashToken(rawKey);
    const row = await this.repo.createApiKey(name, keyHash);
    return { id: row.id, rawKey };
  }

  // Resolves a raw key to its stored id + name if it is active (not revoked).
  // The guard uses the id as the per-key rate-limit identity and the name as
  // the authenticated identity for key-authenticated requests.
  async resolveApiKey(
    rawKey: string,
  ): Promise<{ id: string; name: string } | null> {
    const row = await this.repo.findApiKeyByHash(hashToken(rawKey));
    if (!row || row.revokedAt) return null;
    return { id: row.id, name: row.name };
  }
}
