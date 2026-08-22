import { Module } from '@nestjs/common';
import { AppConfigModule } from '@config/app-config.module';
import { PrismaConnection } from './prisma-connection';
import { TransactionContext } from './transaction-context';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { PostgresAdvisoryLock } from './postgres-advisory-lock';

@Module({
  imports: [AppConfigModule],
  providers: [
    PrismaConnection,
    TransactionContext,
    PrismaUnitOfWork,
    PostgresAdvisoryLock,
  ],
  exports: [
    PrismaConnection,
    TransactionContext,
    PrismaUnitOfWork,
    PostgresAdvisoryLock,
  ],
})
export class PrismaModule {}
