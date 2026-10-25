import { Module } from '@nestjs/common';
import { AuthModule } from '@internal/auth/auth.module';
import { ApiKeysController } from './api-keys.controller';

@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
})
export class ApiKeysModule {}
