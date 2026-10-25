import {
  ConflictException,
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
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

export interface CreatedUserView {
  user: UserView;
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

const TEMP_PASSWORD_BYTES = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    private readonly audit: AuditService,
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
    const temporaryPassword = this.tempPassword();
    const passwordHash = await this.hasher.hashPassword(temporaryPassword);
    const user = await this.repo.createUser(username, passwordHash, {
      role,
      mustChangePassword: true,
      createdBy: actor.username,
    });
    await this.audit.record({
      actor: actor.username,
      action: AUDIT_ACTIONS.userCreate,
      targetType: 'user',
      targetId: user.id,
      metadata: { username, role },
    });
    return { user: toView(user), temporaryPassword };
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
  }

  async resetPassword(
    actor: { username: string },
    id: string,
  ): Promise<{ temporaryPassword: string }> {
    const target = await this.repo.findUserById(id);
    if (!target) throw new NotFoundException('User not found');
    const temporaryPassword = this.tempPassword();
    const passwordHash = await this.hasher.hashPassword(temporaryPassword);
    await this.repo.updatePassword(id, passwordHash, true);
    await this.repo.deleteSessionsForUser(id);
    await this.audit.record({
      actor: actor.username,
      action: AUDIT_ACTIONS.userResetPassword,
      targetType: 'user',
      targetId: id,
      metadata: { username: target.username },
    });
    return { temporaryPassword };
  }

  private tempPassword(): string {
    return randomBytes(TEMP_PASSWORD_BYTES).toString('base64url');
  }
}
