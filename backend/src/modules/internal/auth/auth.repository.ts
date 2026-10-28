import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { UserRole } from '@/prisma/client';

export interface AuthUserRow {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  deactivatedAt: Date | null;
  createdBy: string | null;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  createdAt: Date;
}

export interface SessionRow {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  keyHash: string;
  keyHint: string | null;
  ownerId: string | null;
  scopes: string[];
  projectNames: string[];
  owner?: { username: string } | null;
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
  ownerId: string | null;
  scopes: string[];
  projectNames: string[];
  createdBy: string | null;
  expiresAt: Date | null;
}

// The retirement half of a rotation: the predecessor stops authenticating
// either immediately (revokedAt) or when its grace window runs out (expiresAt).
// Keys have unique names, so the predecessor's name is released before the
// successor is created and the successor keeps the name people know.
export interface ApiKeyRetirement {
  revokedAt: Date | null;
  expiresAt: Date | null;
  revokedReason: string;
  retiredName?: string;
}

// Transaction-aware, because the user-management writes ride a
// PrismaUnitOfWork transaction in UsersService: the user row and the audit row
// naming who created or changed it have to commit together. This repository
// used to take PrismaConnection directly, on the premise that "auth writes never
// join an ambient transaction" — true for the session, login and two-factor
// writes, false for the user writes, whose row therefore committed outside the
// audit's transaction and survived its rollback.
//
// BaseRepository resolves to the bare connection when no transaction is open,
// so the two standalone writers (bootstrapAdmin at boot, the password-change
// path) are unchanged — and they are also why no method here asserts
// writability: a bootstrap without a transaction is legitimate.
@Injectable()
export class AuthRepository extends BaseRepository {
  async findUserByUsername(username: string): Promise<AuthUserRow | null> {
    return this.client.user.findUnique({ where: { username } });
  }

  async findUserById(id: string): Promise<AuthUserRow | null> {
    return this.client.user.findUnique({ where: { id } });
  }

  async createUser(
    username: string,
    passwordHash: string,
    options: {
      role?: UserRole;
      mustChangePassword?: boolean;
      createdBy?: string | null;
    } = {},
  ): Promise<AuthUserRow> {
    return this.client.user.create({
      data: {
        username,
        passwordHash,
        role: options.role ?? 'MEMBER',
        mustChangePassword: options.mustChangePassword ?? false,
        createdBy: options.createdBy ?? null,
      },
    });
  }

  async listUsers(): Promise<AuthUserRow[]> {
    return this.client.user.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async updateUser(
    id: string,
    data: {
      role?: UserRole;
      isActive?: boolean;
      deactivatedAt?: Date | null;
    },
  ): Promise<AuthUserRow> {
    return this.client.user.update({ where: { id }, data });
  }

  async updatePassword(
    id: string,
    passwordHash: string,
    mustChangePassword: boolean,
  ): Promise<void> {
    await this.client.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword },
    });
  }

  async deleteSessionsForUser(userId: string): Promise<number> {
    const result = await this.client.session.deleteMany({ where: { userId } });
    return result.count;
  }

  // A deactivated user must not keep acting through keys they own. Revoking
  // keeps the row (and its rotation history) so the audit trail still resolves,
  // while the key itself stops authenticating.
  async revokeApiKeysForOwner(
    ownerId: string,
    reason: string,
  ): Promise<number> {
    const result = await this.client.apiKey.updateMany({
      where: { ownerId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  async countActiveAdmins(): Promise<number> {
    return this.client.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    context: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<SessionRow> {
    return this.client.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        lastSeenAt: new Date(),
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
    return this.client.session.findUnique({ where: { tokenHash } });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.client.session.deleteMany({ where: { tokenHash } });
  }

  async listSessions(userId: string): Promise<SessionRow[]> {
    return this.client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async revokeSession(id: string, userId: string): Promise<boolean> {
    const result = await this.client.session.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const result = await this.client.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async touchSession(
    id: string,
    data: { lastSeenAt: Date; ip: string | null; userAgent: string | null },
  ): Promise<void> {
    await this.client.session.update({ where: { id }, data });
  }

  async createTwoFactorChallenge(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.client.twoFactorChallenge.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async findTwoFactorChallengeByTokenHash(tokenHash: string) {
    return this.client.twoFactorChallenge.findUnique({
      where: { tokenHash },
    });
  }

  async incrementTwoFactorChallengeAttempts(id: string): Promise<void> {
    await this.client.twoFactorChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async deleteTwoFactorChallenge(id: string): Promise<void> {
    await this.client.twoFactorChallenge.delete({ where: { id } });
  }

  async setTotpSecret(userId: string, secret: string): Promise<void> {
    await this.client.user.update({
      where: { id: userId },
      data: { totpSecret: secret, totpEnabledAt: null },
    });
  }

  async enableTotp(userId: string): Promise<void> {
    await this.client.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date() },
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.client.$transaction([
      this.client.user.update({
        where: { id: userId },
        data: { totpSecret: null, totpEnabledAt: null },
      }),
      this.client.recoveryCode.deleteMany({ where: { userId } }),
    ]);
  }

  async createRecoveryCodes(
    userId: string,
    codeHashes: string[],
  ): Promise<void> {
    await this.client.$transaction([
      this.client.recoveryCode.deleteMany({ where: { userId } }),
      this.client.recoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  }

  async findUnusedRecoveryCode(userId: string, codeHash: string) {
    return this.client.recoveryCode.findFirst({
      where: { userId, codeHash, usedAt: null },
    });
  }

  async markRecoveryCodeUsed(id: string): Promise<void> {
    await this.client.recoveryCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async extendSessionExpiry(tokenHash: string, expiresAt: Date): Promise<void> {
    await this.client.session.update({
      where: { tokenHash },
      data: { expiresAt },
    });
  }

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKeyRow> {
    this.assertWritable();
    return this.client.apiKey.create({ data: input });
  }

  // Rotation creates the successor and retires the predecessor atomically: a
  // half-applied rotation would either leave the caller locked out or leave two
  // live keys behind unintentionally. The predecessor points at its successor
  // (replacedById) so the audit trail survives. The caller owns that
  // transaction — ApiKeyService.rotateKey wraps the rotation and its audit row —
  // so this rides the ambient client instead of opening a nested one.
  async replaceApiKey(
    created: CreateApiKeyInput,
    retiredId: string,
    retirement: ApiKeyRetirement,
  ): Promise<ApiKeyRow> {
    this.assertWritable();
    const { retiredName, ...retirementData } = retirement;
    if (retiredName) {
      await this.client.apiKey.update({
        where: { id: retiredId },
        data: { name: retiredName },
      });
    }
    const row = await this.client.apiKey.create({ data: created });
    await this.client.apiKey.update({
      where: { id: retiredId },
      data: { ...retirementData, replacedById: row.id },
    });
    return row;
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
    return this.client.apiKey.findUnique({
      where: { keyHash },
      include: { owner: { select: { username: true } } },
    });
  }

  async findApiKeyById(id: string): Promise<ApiKeyRow | null> {
    return this.client.apiKey.findUnique({
      where: { id },
      include: { owner: { select: { username: true } } },
    });
  }

  async listApiKeys(): Promise<ApiKeyRow[]> {
    return this.client.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { username: true } } },
    });
  }

  async revokeApiKey(
    id: string,
    revokedAt: Date,
    revokedReason: string | null,
  ): Promise<ApiKeyRow> {
    this.assertWritable();
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
    this.assertWritable();
    await this.client.apiKey.delete({ where: { id } });
  }

  async countUsers(): Promise<number> {
    return this.client.user.count();
  }
}
