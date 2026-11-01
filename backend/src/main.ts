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
import { SESSION_COOKIE } from '@common/http/session-cookie';
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
  // Anonymous log ingestion must not accept the full JSON budget: the body is
  // parsed before the rate-limit guard runs, so a 10 MB limit would let any
  // client spend real CPU per request. The global parser skips a body that was
  // already parsed here.
  app.use('/api/v1/log', bodyParser.json({ limit: '64kb' }));
  app.use(
    '/api/v1/log',
    bodyParser.urlencoded({ limit: '64kb', extended: true }),
  );
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

  // The session cookie is marked Secure when AUTH_COOKIE_SECURE is set, or when
  // the request itself arrived over TLS. A production deployment that terminates
  // TLS in front of the app therefore has to set the flag; we warn instead of
  // forcing it, because a plain-HTTP self-hosted install is a supported
  // topology and forcing it would break login there.
  if (appConfig.app.env === 'production' && !appConfig.auth.cookieSecure) {
    app
      .get(AppLoggerService)
      .warn(
        'AUTH_COOKIE_SECURE is not set in production: session cookies will not carry the Secure flag unless the request arrives over TLS',
      );
  }

  // Trust exactly one X-Forwarded-For hop (nginx/ingress) so the IP-keyed
  // login/log rate limits and request logging see the real client IP instead
  // of the proxy IP. A hop count rather than a boolean: `true` would trust
  // every appended entry and let a client spoof req.ip. Opt-in via
  // TRUST_PROXY; `false` keeps the default Express behavior for direct
  // exposure.
  app.set('trust proxy', appConfig.trustProxyHops);

  configureBodyParsers(app, appConfig);
  configureSecurity(app, appConfig);

  app.useGlobalPipes(createValidationPipe());

  // /docs publishes every route, DTO and admin path anonymously. It stays a
  // local/e2e convenience unless SWAGGER_ENABLED is set explicitly.
  if (appConfig.swagger.enabled) {
    configureSwagger(app, appConfig);
  }

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
