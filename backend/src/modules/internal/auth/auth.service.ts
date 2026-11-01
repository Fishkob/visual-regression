import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import { AppConfigService } from '@config/app-config.service';
import { AuthRepository } from './auth.repository';
import { hashToken } from './token-hash';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from './totp';
import { needsRehash } from './password-hasher';
import type { AuthUserRow } from './auth.repository';

export interface LoginResult {
  token: string;
  username: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  mustChangePassword: boolean;
  totpEnabled: boolean;
}

export interface TwoFactorChallengeResult {
  twoFactorRequired: true;
  challengeToken: string;
}

export type LoginOutcome = LoginResult | TwoFactorChallengeResult;

export interface AuthRequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface SessionView {
  id: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const TOTP_ISSUER = 'Visual Regression';

const SESSION_TOKEN_BYTES = 32;

// A real scrypt hash for a throwaway password, verified against when the
// username does not exist so an attacker cannot distinguish "unknown user"
// from "wrong password" by response time.
const DUMMY_PASSWORD_HASH =
  '86c840913f3af30dd8dad0777856acd1:1d136b24095a76530e8280f40b80d0423e3978833469f7c69eb768d30a34b69b19c0074368157c12d2ca6858acf07e1a18a8379ec70c73447725ec7035b94425';

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    private readonly appConfig: AppConfigService,
  ) {}

  async login(
    username: string,
    password: string,
    context: AuthRequestContext = {},
  ): Promise<LoginOutcome> {
    const user = await this.repo.findUserByUsername(username);
    const isPasswordValid = await this.hasher.verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !isPasswordValid || !user.isActive) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // The plaintext is only available here, so this is the one place a legacy
    // hash can be upgraded in place. A failed upgrade must never fail the login
    // (the password was already verified); the row simply keeps its old hash.
    if (needsRehash(user.passwordHash)) {
      await this.rehashLegacyPassword(user.id, password);
    }

    if (user.totpEnabledAt) {
      const challengeToken =
        randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
      await this.repo.createTwoFactorChallenge(
        user.id,
        hashToken(challengeToken),
        new Date(Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS),
      );
      return { twoFactorRequired: true, challengeToken };
    }

    return this.issueSession(user, context);
  }

  private async rehashLegacyPassword(
    userId: string,
    password: string,
  ): Promise<void> {
    try {
      const passwordHash = await this.hasher.hashPassword(password);
      await this.repo.updatePassword(userId, passwordHash, false);
    } catch {
      // Best-effort: the hash is still valid at its old cost factor.
    }
  }

  private async issueSession(
    user: AuthUserRow,
    context: AuthRequestContext,
  ): Promise<LoginResult> {
    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.appConfig.auth.sessionTtlMs);
    await this.repo.createSession(user.id, hashToken(token), expiresAt, {
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });
    return {
      token,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      totpEnabled: user.totpEnabledAt !== null,
    };
  }

  async verifyTwoFactor(
    challengeToken: string,
    code: string,
    context: AuthRequestContext = {},
  ): Promise<LoginResult> {
    const challenge = await this.repo.findTwoFactorChallengeByTokenHash(
      hashToken(challengeToken),
    );
    if (
      !challenge ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS
    ) {
      throw new UnauthorizedException('Two-factor challenge expired');
    }
    const user = await this.repo.findUserById(challenge.userId);
    if (!user || !user.isActive || !user.totpSecret) {
      throw new UnauthorizedException('Authentication required');
    }

    const isTotpValid = verifyTotp(user.totpSecret, code);
    let isRecoveryValid = false;
    if (!isTotpValid) {
      const recovery = await this.repo.findUnusedRecoveryCode(
        user.id,
        hashRecoveryCode(code),
      );
      if (recovery) {
        await this.repo.markRecoveryCodeUsed(recovery.id);
        isRecoveryValid = true;
      }
    }
    if (!isTotpValid && !isRecoveryValid) {
      await this.repo.incrementTwoFactorChallengeAttempts(challenge.id);
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.repo.deleteTwoFactorChallenge(challenge.id);
    return this.issueSession(user, context);
  }

  async startTotpSetup(
    userId: string,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new UnauthorizedException('Authentication required');
    if (user.totpEnabledAt) {
      throw new ConflictException(
        'Two-factor authentication is already enabled',
      );
    }
    const secret = generateTotpSecret();
    await this.repo.setTotpSecret(user.id, secret);
    return {
      secret,
      otpauthUrl: otpauthUrl(TOTP_ISSUER, user.username, secret),
    };
  }

  async enableTotp(userId: string, code: string): Promise<string[]> {
    const user = await this.repo.findUserById(userId);
    if (!user?.totpSecret) {
      throw new BadRequestException('Start the two-factor setup first');
    }
    if (!verifyTotp(user.totpSecret, code)) {
      throw new BadRequestException('Invalid two-factor code');
    }
    await this.repo.enableTotp(user.id);
    const recoveryCodes = generateRecoveryCodes();
    await this.repo.createRecoveryCodes(
      user.id,
      recoveryCodes.map(hashRecoveryCode),
    );
    return recoveryCodes;
  }

  async disableTotp(userId: string, password: string): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (
      !user ||
      !(await this.hasher.verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Password is incorrect');
    }
    await this.repo.disableTotp(user.id);
  }

  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionView[]> {
    const sessions = await this.repo.listSessions(userId);
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      ip: session.ip,
      userAgent: session.userAgent,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, id: string): Promise<void> {
    const isRevoked = await this.repo.revokeSession(id, userId);
    if (!isRevoked) {
      throw new BadRequestException('Session not found or already revoked');
    }
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<number> {
    return this.repo.revokeAllSessions(userId, currentSessionId);
  }

  // Changing a password revokes every session (including the current one) and
  // issues a fresh one: a stolen cookie stops working at the same moment the
  // password changes.
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ token: string }> {
    const user = await this.repo.findUserById(userId);
    if (
      !user ||
      !user.isActive ||
      !(await this.hasher.verifyPassword(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await this.hasher.hashPassword(newPassword);
    await this.repo.updatePassword(user.id, passwordHash, false);
    await this.repo.deleteSessionsForUser(user.id);
    // Changing the password rotates every credential derived from the account.
    // A session stolen before the change could have minted an API key (the key
    // management surface is session-only); leaving those keys alive would keep
    // the intruder in after the password was rotated.
    await this.repo.revokeApiKeysForOwner(user.id, 'password-changed');
    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.appConfig.auth.sessionTtlMs);
    await this.repo.createSession(user.id, hashToken(token), expiresAt);
    return { token };
  }

  async logout(token: string): Promise<void> {
    await this.repo.deleteSessionByTokenHash(hashToken(token));
  }
}
