import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { PrismaModule } from '@prisma/prisma.module';
import { AuditModule } from '@internal/audit/audit.module';
import {
  PASSWORD_HASHER,
  type PasswordHasherPort,
} from '@common/domain/password-hasher.interface';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { ApiKeyService } from './api-key.service';
import { AuthenticationGuard } from './authentication.guard';
import { TotpSecretCipher } from './totp-secret-cipher';
import { hashPassword, verifyPassword } from './password-hasher';

@Module({
  imports: [AppConfigModule, PrismaModule, AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    ApiKeyService,
    TotpSecretCipher,
    AuthenticationGuard,
    {
      provide: PASSWORD_HASHER,
      useValue: { hashPassword, verifyPassword } satisfies PasswordHasherPort,
    },
  ],
  exports: [
    AuthRepository,
    ApiKeyService,
    AuthenticationGuard,
    PASSWORD_HASHER,
  ],
})
export class AuthModule {}
