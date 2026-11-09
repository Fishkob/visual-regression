import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';
import type { UserRole } from '@/prisma/client';

export interface UserInviteRow {
  id: string;
  userId: string;
  tokenHash: string;
  createdBy: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    role: UserRole;
    isActive: boolean;
    mustChangePassword: boolean;
  };
}

const WITH_USER = {
  user: {
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
    },
  },
} as const;

// Transaction-aware: `POST /users` writes the account and its invite in one
// transaction, because an account whose link failed to store can never sign in
// (its password exists only inside that link).
@Injectable()
export class UserInviteRepository extends BaseRepository {
  // One outstanding invite per account. A reset replaces the previous link
  // instead of adding a second one, so the older link cannot reveal a password
  // that a newer issuance supersedes.
  async replace(input: {
    userId: string;
    tokenHash: string;
    createdBy: string | null;
    expiresAt: Date;
  }): Promise<UserInviteRow> {
    await this.client.userInvite.deleteMany({
      where: { userId: input.userId },
    });
    return this.client.userInvite.create({
      data: input,
      include: WITH_USER,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<UserInviteRow | null> {
    return this.client.userInvite.findUnique({
      where: { tokenHash },
      include: WITH_USER,
    });
  }

  // The single-use guard is the WHERE clause, not a read-then-write: two
  // reveals of the same link in parallel both find a pending row, and only the
  // one whose update still matches `consumedAt: null` gets a count of 1.
  async consume(id: string): Promise<boolean> {
    const { count } = await this.client.userInvite.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return count > 0;
  }
}
