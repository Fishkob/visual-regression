import { Injectable } from '@nestjs/common';
import { PrismaConnection } from '@/prisma/prisma-connection';

export interface AuthUserRow {
  id: string;
  username: string;
  passwordHash: string;
}

export interface SessionRow {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  keyHash: string;
  keyHint: string | null;
  createdBy: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  replacedById: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  keyHash: string;
  keyHint: string;
  createdBy: string | null;
  expiresAt: Date | null;
}

// The retirement half of a rotation: the predecessor stops authenticating
// either immediately (revokedAt) or when its grace window runs out (expiresAt).
export interface ApiKeyRetirement {
  revokedAt: Date | null;
  expiresAt: Date | null;
  revokedReason: string;
}

// This repository does not extend BaseRepository: auth reads/writes never join
// a StateChangeWorkflow ambient transaction (they mutate no test status), so
// injecting TransactionContext would be unused — following the read-only
// repository precedent. The standalone writes mirror ProjectRepository.create's
// carve-out.
@Injectable()
export class AuthRepository {
  constructor(private readonly connection: PrismaConnection) {}

  private get client() {
    return this.connection.client;
  }

  async findUserByUsername(username: string): Promise<AuthUserRow | null> {
    return this.client.user.findUnique({ where: { username } });
  }

  async findUserById(id: string): Promise<AuthUserRow | null> {
    return this.client.user.findUnique({ where: { id } });
  }

  async createUser(
    username: string,
    passwordHash: string,
  ): Promise<AuthUserRow> {
    return this.client.user.create({ data: { username, passwordHash } });
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<SessionRow> {
    return this.client.session.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
    return this.client.session.findUnique({ where: { tokenHash } });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.client.session.deleteMany({ where: { tokenHash } });
  }

  async extendSessionExpiry(tokenHash: string, expiresAt: Date): Promise<void> {
    await this.client.session.update({
      where: { tokenHash },
      data: { expiresAt },
    });
  }

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKeyRow> {
    return this.client.apiKey.create({ data: input });
  }

  // Rotation creates the successor and retires the predecessor in one
  // transaction: a half-applied rotation would either leave the caller locked
  // out or leave two live keys behind unintentionally. The predecessor points
  // at its successor (replacedById) so the audit trail survives.
  async replaceApiKey(
    created: CreateApiKeyInput,
    retiredId: string,
    retirement: ApiKeyRetirement,
  ): Promise<ApiKeyRow> {
    return this.client.$transaction(async (tx) => {
      const row = await tx.apiKey.create({ data: created });
      await tx.apiKey.update({
        where: { id: retiredId },
        data: { ...retirement, replacedById: row.id },
      });
      return row;
    });
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
    return this.client.apiKey.findUnique({ where: { keyHash } });
  }

  async findApiKeyById(id: string): Promise<ApiKeyRow | null> {
    return this.client.apiKey.findUnique({ where: { id } });
  }

  async listApiKeys(): Promise<ApiKeyRow[]> {
    return this.client.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async revokeApiKey(
    id: string,
    revokedAt: Date,
    revokedReason: string | null,
  ): Promise<ApiKeyRow> {
    return this.client.apiKey.update({
      where: { id },
      data: { revokedAt, revokedReason },
    });
  }

  async touchApiKeyLastUsed(id: string, at: Date): Promise<void> {
    await this.client.apiKey.update({
      where: { id },
      data: { lastUsedAt: at },
    });
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.client.apiKey.delete({ where: { id } });
  }

  async countUsers(): Promise<number> {
    return this.client.user.count();
  }
}
