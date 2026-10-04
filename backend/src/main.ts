import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@app';
import { WorkerModule } from './worker.module';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';
import { loadEnv, readBootstrapEnv } from '@config/bootstrap-env';
import { createValidationPipe } from '@common/http/validation-pipe';
import { WorkerHealthServer } from '@internal/worker/worker-health-server';
import { bootstrapAdmin } from '@internal/auth/bootstrap-admin';
import { AuthRepository } from '@internal/auth/auth.repository';
import { hashPassword } from '@internal/auth/password-hasher';
import { startTracing } from './tracing.setup';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';

async function bootstrap(): Promise<void> {
  loadEnv();
  const { nodeMode, otelExporterEndpoint } = readBootstrapEnv();
  startTracing(otelExporterEndpoint);

  if (nodeMode === 'worker') {
    await bootstrapWorker();
    return;
  }

  await bootstrapApi();
}

function configureBodyParsers(
  app: NestExpressApplication,
  appConfig: AppConfigService,
): void {
  app.use(bodyParser.json({ limit: appConfig.maxBodySize }));
  app.use(
    bodyParser.urlencoded({ limit: appConfig.maxBodySize, extended: true }),
  );
}

function configureSecurity(
  app: NestExpressApplication,
  appConfig: AppConfigService,
): void {
  const isCspEnabled = appConfig.csp.enabled;
  const rustfsPublicUrl = appConfig.rustfs.publicUrl;
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      ...(isCspEnabled
        ? {
            contentSecurityPolicy: {
              directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", rustfsPublicUrl].filter(Boolean),
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                connectSrc: ["'self'"],
              },
            },
          }
        : { contentSecurityPolicy: false }),
    }),
  );

  const corsOrigin = appConfig.cors.origin;
  if (corsOrigin === '*') {
    app.enableCors({ origin: '*' });
  } else if (corsOrigin) {
    const allowedOrigins = corsOrigin.split(',').map((o) => o.trim());
    app.enableCors({ origin: allowedOrigins, credentials: true });
  }
}

function configureSwagger(
  app: INestApplication,
  appConfig: AppConfigService,
): void {
  const config = new DocumentBuilder()
    .setTitle('Visual Regression API')
    .setDescription('API documentation for screenshot upload and comparison')
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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}

async function bootstrapApi(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    logger: false,
  });

  app.setGlobalPrefix('api/v1');
  const appConfig = app.get(AppConfigService);

  // Trust X-Forwarded-For from the reverse proxy so the IP-keyed login/log
  // rate limits and request logging see the real client IP (they collapse to
  // the proxy IP otherwise). Opt-in via TRUST_PROXY; `false` keeps the default
  // Express behavior for direct exposure.
  app.set('trust proxy', appConfig.trustProxy);

  configureBodyParsers(app, appConfig);
  configureSecurity(app, appConfig);

  app.useGlobalPipes(createValidationPipe());

  configureSwagger(app, appConfig);

  const port = appConfig.app.port;

  await bootstrapAdmin(
    app.get(AuthRepository),
    { hashPassword },
    appConfig,
    app.get(AppLoggerService),
  );

  await app.listen(port);
  // Nest turns SIGTERM/SIGINT into app.close(): the Express adapter stops
  // accepting requests, closes open connections, then every onModuleDestroy /
  // onApplicationShutdown hook runs (PrismaConnection.$disconnect, storage,
  // AppShutdownService). useProcessExit makes Pino flush its async buffer.
  app.enableShutdownHooks([], { useProcessExit: true });

  return app;
}

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
  });

  const logger = app.get(AppLoggerService);
  logger.log('Worker started', { mode: 'worker' });

  // Start health server for liveness probes
  const healthServer = app.get(WorkerHealthServer);
  await healthServer.start();

  // Same lifecycle contract as the API: signals call app.close(), which runs
  // WorkerHealthServer.onApplicationShutdown, AppShutdownService, and the
  // Prisma/storage/poller onModuleDestroy hooks. useProcessExit flushes Pino.
  app.enableShutdownHooks([], { useProcessExit: true });
}

void bootstrap();
