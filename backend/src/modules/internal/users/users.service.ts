import {
  ConflictException,
  Inject,
  Injectable,
  BadRequestException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import { AUDIT_ACTIONS } from '@internal/audit/audit.types';
import { AuditService } from '@internal/audit/audit.service';
import {
  AuthRepository,
  type AuthUserRow,
} from '@internal/auth/auth.repository';
import { hashToken } from '@internal/auth/token-hash';
import {
  UserInviteRepository,
  type UserInviteRow,
} from '@internal/users/user-invite.repository';
import {
  inviteExpiry,
  invitePassword,
  inviteStatus,
  mintInviteToken,
  type InviteStatus,
} from '@internal/users/user-invite';
import type { UserRole } from '@/prisma/client';

export interface UserView {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  deactivatedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

// What the admin gets back instead of a password: the link, not its content.
// The token is the only copy that will ever exist — the service keeps a hash.
export interface UserInviteLinkView {
  token: string;
  expiresAt: Date;
}

export interface CreatedUserView {
  user: UserView;
  invite: UserInviteLinkView;
}

export interface InvitePreviewView {
  username: string;
  role: UserRole;
  expiresAt: Date;
  status: InviteStatus;
}

export interface RevealedInviteView {
  username: string;
  temporaryPassword: string;
}

function toView(row: AuthUserRow): UserView {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    deactivatedAt: row.deactivatedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function inviteLink(token: string, row: UserInviteRow): UserInviteLinkView {
  return { token, expiresAt: row.expiresAt };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly invites: UserInviteRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    private readonly audit: AuditService,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  async list(): Promise<UserView[]> {
    return (await this.repo.listUsers()).map(toView);
  }

  async create(
    actor: { id?: string; username: string },
    username: string,
    role: UserRole,
  ): Promise<CreatedUserView> {
    const existing = await this.repo.findUserByUsername(username);
    if (existing) {
      throw new ConflictException(`User "${username}" already exists`);
    }
    const { token, passwordHash, expiresAt } = await this.issueCredential();
    // The row and its trail commit together: an account created without a record
    // of who created it is the one thing user administration must never produce.
    // The invite rides the same transaction for a second reason — the password
    // exists only inside the link, so an account whose invite failed to store
    // could never sign in.
    return this.uow.execute(async () => {
      const user = await this.repo.createUser(username, passwordHash, {
        role,
        mustChangePassword: true,
        createdBy: actor.username,
      });
      const invite = await this.invites.replace({
        userId: user.id,
        tokenHash: hashToken(token),
        createdBy: actor.username,
        expiresAt,
      });
      await this.audit.record({
        actor: actor.username,
        action: AUDIT_ACTIONS.userCreate,
        targetType: 'user',
        targetId: user.id,
        metadata: {
          username,
          role,
          inviteExpiresAt: invite.expiresAt.toISOString(),
        },
      });
      return { user: toView(user), invite: inviteLink(token, invite) };
    });
  }

  async update(
    actor: { id?: string; username: string },
    id: string,
    changes: { role?: UserRole; isActive?: boolean },
  ): Promise<UserView> {
    const target = await this.repo.findUserById(id);
    if (!target) throw new NotFoundException('User not found');
    const isDemotingAdmin =
      target.role === 'ADMIN' &&
      changes.role !== undefined &&
      changes.role !== 'ADMIN';
    const isDeactivating = target.isActive && changes.isActive === false;
    if (
      (isDemotingAdmin || isDeactivating) &&
      target.role === 'ADMIN' &&
      (await this.repo.countActiveAdmins()) <= 1
    ) {
      throw new ConflictException('The last active admin cannot be removed');
    }
    if (id === actor.id && changes.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    // Deactivation also revokes the sessions and the API keys the user owns, and
    // all of it commits together — otherwise a failed audit write leaves a
    // deactivated user still signed in, or a long-lived CI key still
    // authenticating on their behalf.
    return this.uow.execute(async () => {
      const updated = await this.repo.updateUser(id, {
        ...(changes.role !== undefined ? { role: changes.role } : {}),
        ...(changes.isActive !== undefined
          ? {
              isActive: changes.isActive,
              deactivatedAt: changes.isActive ? null : new Date(),
            }
          : {}),
      });
      if (changes.isActive === false) {
        await this.repo.deleteSessionsForUser(id);
        await this.repo.revokeApiKeysForOwner(id, 'owner-deactivated');
      }
      await this.audit.record({
        actor: actor.username,
        action: AUDIT_ACTIONS.userUpdate,
        targetType: 'user',
        targetId: id,
        metadata: {
          username: target.username,
          ...(changes.role !== undefined ? { role: changes.role } : {}),
          ...(changes.isActive !== undefined
            ? { isActive: changes.isActive }
            : {}),
        },
      });
      return toView(updated);
    });
  }

  async resetPassword(
    actor: { username: string },
    id: string,
  ): Promise<{ invite: UserInviteLinkView }> {
    const target = await this.repo.findUserById(id);
    if (!target) throw new NotFoundException('User not found');
    const { token, passwordHash, expiresAt } = await this.issueCredential();
    // Password, session/API-key revocation and trail are one change: a reset
    // that fails to revoke the old credentials, or to record itself, is a
    // half-done reset. API keys are included because the reset is the
    // compromise-remediation action — a leaked CI key that keeps working would
    // defeat it.
    return this.uow.execute(async () => {
      await this.repo.updatePassword(id, passwordHash, true);
      await this.repo.deleteSessionsForUser(id);
      await this.repo.revokeApiKeysForOwner(id, 'password-reset');
      const invite = await this.invites.replace({
        userId: id,
        tokenHash: hashToken(token),
        createdBy: actor.username,
        expiresAt,
      });
      await this.audit.record({
        actor: actor.username,
        action: AUDIT_ACTIONS.userResetPassword,
        targetType: 'user',
        targetId: id,
        metadata: {
          username: target.username,
          inviteExpiresAt: invite.expiresAt.toISOString(),
        },
      });
      return { invite: inviteLink(token, invite) };
    });
  }

  // Read-only: the invite page asks who the link belongs to before the user
  // commits the one reveal it has. Opening a link must not consume it — chat
  // clients and mail scanners fetch every URL they are shown.
  async peekInvite(token: string): Promise<InvitePreviewView> {
    const invite = await this.findInvite(token);
    return {
      username: invite.user.username,
      role: invite.user.role,
      expiresAt: invite.expiresAt,
      status: inviteStatus(invite),
    };
  }

  async claimInvite(
    token: string,
    context: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<RevealedInviteView> {
    const invite = await this.findInvite(token);
    const status = inviteStatus(invite);
    if (status === 'used') {
      throw new GoneException('The invite link has already been used');
    }
    if (status === 'expired') {
      throw new GoneException('The invite link has expired');
    }
    // Consumption and its trail commit together, so a reveal that is logged is
    // exactly a reveal that happened, and the other way round.
    await this.uow.execute(async () => {
      if (!(await this.invites.consume(invite.id))) {
        // Another request won the race between the status read and the update.
        throw new GoneException('The invite link has already been used');
      }
      await this.audit.record({
        actor: null,
        action: AUDIT_ACTIONS.userInviteRedeem,
        targetType: 'user',
        targetId: invite.userId,
        metadata: {
          username: invite.user.username,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
        },
      });
    });
    return {
      username: invite.user.username,
      temporaryPassword: invitePassword(token),
    };
  }

  private async findInvite(token: string): Promise<UserInviteRow> {
    const invite = await this.invites.findByTokenHash(hashToken(token));
    if (!invite) throw new NotFoundException('Invite link not found');
    return invite;
  }

  // The credential a link carries, minted once per issuance: the password is
  // derived from the token, hashed for the account row, and never held anywhere
  // else. Hashing before the transaction keeps the (deliberately slow) scrypt
  // work out of it.
  private async issueCredential(): Promise<{
    token: string;
    passwordHash: string;
    expiresAt: Date;
  }> {
    const token = mintInviteToken();
    return {
      token,
      passwordHash: await this.hasher.hashPassword(invitePassword(token)),
      expiresAt: inviteExpiry(),
    };
  }
}
