import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AuditController } from '@internal/audit/audit.controller';
import { AuditRepository } from '@internal/audit/audit.repository';
import { AuditService } from '@internal/audit/audit.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
