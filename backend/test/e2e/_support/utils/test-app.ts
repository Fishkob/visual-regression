import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaConnection } from '@/prisma/prisma-connection';
import { AppModule } from '@app';
import { IntakeWorkerModule } from '@public/visualTest/intake/intake-worker.module';
import { hashToken } from '@internal/auth/token-hash';
import { E2E_API_KEY } from './e2e-api-key';

/**
 * Utility for initializing and cleaning up a test instance of the NestJS app.
 * Used in E2E and integration tests.
 */
export class TestApp {
  private static appInstance: INestApplication | null = null;

  /**
   * Initialize a new NestJS test application with global pipes & modules.
   */
  static async init(): Promise<INestApplication> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, IntakeWorkerModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );

    await app.init();

    this.appInstance = app;

    await this.seedApiKey();

    return app;
  }

  /**
   * Resets all Prisma tables — use between E2E tests for isolation.
   */
  static async resetDb(): Promise<void> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');

    const db = app.get(PrismaConnection).client;

    await db.unifiedVariant.deleteMany();
    await db.unifiedComparison.deleteMany();
    await db.unifiedScreenshot.deleteMany();
    await db.unifiedTest.deleteMany();
    await db.comparisonJob.deleteMany();
    await db.project.deleteMany();
    await db.apiKeyRateLimitBucket.deleteMany();
    await db.session.deleteMany();
    await db.apiKey.deleteMany();
    await db.user.deleteMany();

    await this.seedApiKey();
  }

  /**
   * Seeds the fixed e2e api key (idempotent) so authenticated product requests
   * pass the global AuthenticationGuard. Re-seeded after resetDb() clears it.
   */
  static async seedApiKey(): Promise<void> {
    const app = this.appInstance;
    if (!app) throw new Error('App instance not initialized');
    const db = app.get(PrismaConnection).client;
    const keyHash = hashToken(E2E_API_KEY);
    await db.apiKey.upsert({
      where: { keyHash },
      create: { name: 'e2e', keyHash },
      update: {},
    });
  }

  /**
   * Returns the underlying HTTP server for supertest.
   */
  static getHttpServer(): ReturnType<INestApplication['getHttpServer']> {
    const app = this.appInstance;
    if (!app)
      throw new Error('TestApp not initialized. Call TestApp.init() first.');

    return app.getHttpServer();
  }

  /**
   * Gracefully close the NestJS app.
   */
  static async close(): Promise<void> {
    const app = this.appInstance;
    if (app) {
      await app.close();
      this.appInstance = null;
    }
  }
}
