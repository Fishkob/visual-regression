import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import { AppConfigService } from '@config/app-config.service';
import { AuthRepository } from './auth.repository';
import { hashToken } from './token-hash';

export interface LoginResult {
  token: string;
  username: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  mustChangePassword: boolean;
}

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

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.repo.findUserByUsername(username);
    const isPasswordValid = await this.hasher.verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !isPasswordValid || !user.isActive) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.appConfig.auth.sessionTtlMs);
    await this.repo.createSession(user.id, hashToken(token), expiresAt);

    return {
      token,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
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
    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.appConfig.auth.sessionTtlMs);
    await this.repo.createSession(user.id, hashToken(token), expiresAt);
    return { token };
  }

  async logout(token: string): Promise<void> {
    await this.repo.deleteSessionByTokenHash(hashToken(token));
  }
}
