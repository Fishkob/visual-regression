import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { AuthModule } from '@internal/auth/auth.module';
import { AdminAuthGuard } from '@internal/dlq/admin-auth.guard';
import { AdminApiKeysController } from './admin-api-keys.controller';

@Module({
  imports: [AppConfigModule, AuthModule],
  controllers: [AdminApiKeysController],
  providers: [AdminAuthGuard],
})
export class AdminApiKeysModule {}
