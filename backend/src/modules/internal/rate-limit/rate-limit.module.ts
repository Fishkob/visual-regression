import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { RateLimitService } from './rate-limit.service';

// Exposes RateLimitService so AppModule's global RateLimitGuard can consume it
// without AppModule wiring Prisma itself.
@Module({
  imports: [PrismaModule],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
