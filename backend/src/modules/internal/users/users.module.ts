import { Module } from '@nestjs/common';
import { AuditModule } from '@internal/audit/audit.module';
import { AuthModule } from '@internal/auth/auth.module';
import { UsersController } from '@internal/users/users.controller';
import { UsersService } from '@internal/users/users.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
