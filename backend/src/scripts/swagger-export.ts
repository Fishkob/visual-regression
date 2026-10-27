import { writeFileSync } from 'fs';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { SwaggerAppModule } from '../swagger-app.module';
import { AppConfigService } from '@config/app-config.service';
import { DetailedHealthDto } from '../modules/internal/health/health.types';
import { UploadIntake } from '@public/visualTest/intake/application/upload-intake.service';
import { TestResolver } from '@public/visualTest/core/application/services/test-resolver.service';
import { ProjectService } from '@public/visualTest/catalog/application/project.service';
import { TestCommandService } from '@public/visualTest/review/application/test-command.service';
import { ApprovalService } from '@public/visualTest/review/application/approval.service';
import { TestDeletionService } from '@public/visualTest/core/application/services/test-deletion.service';
import { HealthChecker } from '@internal/health/health-checker.service';
import {
  STORAGE_PROVIDER,
  IStorageProvider,
} from '@common/domain/storage-provider.interface';
import { PostgresJobQueue } from '@internal/job-queue/postgres-job-queue';
import { PrismaUnitOfWork } from '@/prisma/prisma-unit-of-work';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { ProjectRepository } from '@public/visualTest/core/infrastructure/repositories/prisma-project.repository';
import { UnifiedTestRepository } from '@public/visualTest/core/infrastructure/repositories/unified-test.repository';
import { UnifiedScreenshotRepository } from '@public/visualTest/core/infrastructure/repositories/unified-screenshot.repository';
import { UnifiedComparisonsRepository } from '@public/visualTest/core/infrastructure/repositories/unified-comparisons.repository';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AuthRepository } from '@internal/auth/auth.repository';
import { ApiKeyService } from '@internal/auth/api-key.service';
import { AuthService } from '@internal/auth/auth.service';
import { AuthenticationGuard } from '@internal/auth/authentication.guard';
import { SESSION_COOKIE } from '@common/http/session-cookie';

async function main() {
  const moduleRef = await Test.createTestingModule({
    imports: [SwaggerAppModule],
  })
    .overrideProvider(TestResolver)
    .useValue({} as TestResolver)
    .overrideProvider(UploadIntake)
    .useValue({} as UploadIntake)
    .overrideProvider(ProjectService)
    .useValue({} as ProjectService)
    .overrideProvider(TestCommandService)
    .useValue({} as TestCommandService)
    .overrideProvider(ApprovalService)
    .useValue({} as ApprovalService)
    .overrideProvider(TestDeletionService)
    .useValue({} as TestDeletionService)
    .overrideProvider(AppLoggerService)
    .useValue({
      log: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
      setContext: () => {},
    } as unknown as AppLoggerService)
    .overrideProvider(HealthChecker)
    .useValue({} as HealthChecker)
    .overrideProvider(ProjectRepository)
    .useValue({} as ProjectRepository)
    .overrideProvider(UnifiedTestRepository)
    .useValue({} as UnifiedTestRepository)
    .overrideProvider(UnifiedScreenshotRepository)
    .useValue({} as UnifiedScreenshotRepository)
    .overrideProvider(UnifiedComparisonsRepository)
    .useValue({} as UnifiedComparisonsRepository)
    .overrideProvider(PostgresJobQueue)
    .useValue({} as PostgresJobQueue)
    .overrideProvider(STORAGE_PROVIDER)
    .useValue({} as IStorageProvider)
    .overrideProvider(PrismaUnitOfWork)
    .useValue({} as PrismaUnitOfWork)
    .overrideProvider(PrismaConnection)
    .useValue({} as PrismaConnection)
    .overrideProvider(AuthRepository)
    .useValue({} as AuthRepository)
    .overrideProvider(ApiKeyService)
    .useValue({} as ApiKeyService)
    .overrideProvider(AuthService)
    .useValue({} as AuthService)
    .overrideProvider(AuthenticationGuard)
    .useValue({} as AuthenticationGuard)
    .compile();

  const app = moduleRef.createNestApplication();

  const appConfig = app.get(AppConfigService);
  const baseUrl = appConfig.swagger.baseUrl;
  const prefix = 'api/v1';

  const config = new DocumentBuilder()
    .setTitle('Visual Regression API')
    .setDescription('OpenAPI documentation for upload and comparison endpoints')
    .addServer(`${baseUrl}/${prefix}`)
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: appConfig.auth.apiKeyHeader ?? 'x-api-key',
        description: 'API key for CI pipelines',
      },
      'apiKeyAuth',
    )
    .addSecurityRequirements('apiKeyAuth')
    .addCookieAuth(
      SESSION_COOKIE,
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'Browser session cookie (POST /auth/login)',
      },
      'sessionCookie',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [DetailedHealthDto],
  });

  writeFileSync('./swagger.json', JSON.stringify(document, null, 2));

  await app.close();
  console.log(`SWAGGER: DONE (${baseUrl}/${prefix})`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('FATAL:', msg);
  if (err instanceof Error && err.stack) {
    console.error('FATAL Stack:', err.stack);
  }
  process.exit(1);
});
