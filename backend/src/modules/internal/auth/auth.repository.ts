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
  revokedAt: Date | null;
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
    await this.client.session.delete({ where: { tokenHash } });
  }

  async extendSessionExpiry(tokenHash: string, expiresAt: Date): Promise<void> {
    await this.client.session.update({
      where: { tokenHash },
      data: { expiresAt },
    });
  }

  async createApiKey(name: string, keyHash: string): Promise<ApiKeyRow> {
    return this.client.apiKey.create({ data: { name, keyHash } });
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
    return this.client.apiKey.findUnique({ where: { keyHash } });
  }

  async countUsers(): Promise<number> {
    return this.client.user.count();
  }
}
