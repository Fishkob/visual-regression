import { PrismaModule } from '@prisma/prisma.module';
import { Module } from '@nestjs/common';
import { AuditModule } from '@internal/audit/audit.module';
import { AuthModule } from '@internal/auth/auth.module';
import {
  PublicUserInviteController,
  UsersController,
} from '@internal/users/users.controller';
import { UserInviteRepository } from '@internal/users/user-invite.repository';
import { UsersService } from '@internal/users/users.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [UsersController, PublicUserInviteController],
  providers: [UsersService, UserInviteRepository],
})
export class UsersModule {}
