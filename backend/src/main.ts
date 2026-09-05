import { NestFactory, Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '@app';
import { WorkerModule } from './worker.module';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AppConfigService } from '@config/app-config.service';
import { WorkerHealthServer } from '@internal/worker/worker-health-server';
import { bootstrapAdmin } from '@internal/auth/bootstrap-admin';
import { AuthRepository } from '@internal/auth/auth.repository';
import { hashPassword } from '@internal/auth/password-hasher';
import { startTracing, shutdownTracing } from './tracing.setup';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';

async function bootstrap(): Promise<void> {
  const appConfig = new AppConfigService(new ConfigService());
  startTracing(appConfig.otel.exporterEndpoint);

  const nodeMode = appConfig.nodeMode;

  if (nodeMode === 'worker') {
    await bootstrapWorker();
    return;
  }

  await bootstrapApi();
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

  // Global body parser limit
  app.use(bodyParser.json({ limit: appConfig.maxBodySize }));
  app.use(
    bodyParser.urlencoded({ limit: appConfig.maxBodySize, extended: true }),
  );

  // Helmet
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

  // CORS
  const corsOrigin = appConfig.cors.origin;
  if (corsOrigin === '*') {
    app.enableCors({ origin: '*' });
  } else if (corsOrigin) {
    const allowedOrigins = corsOrigin.split(',').map((o) => o.trim());
    app.enableCors({ origin: allowedOrigins, credentials: true });
  }

  // Global Middleware
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Swagger
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

  const port = app.get(AppConfigService).app.port;

  await bootstrapAdmin(
    app.get(AuthRepository),
    { hashPassword },
    appConfig,
    app.get(AppLoggerService),
  );

  await app.listen(port);

  let isShuttingDown = false;

  const shutdownApi = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    const logger = app.get(AppLoggerService);
    logger.log(`Shutting down API (${signal})...`);

    try {
      const server = app.getHttpServer();
      server.close();

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          logger.warn('Request drain timeout reached, forcing shutdown');
          resolve();
        }, 30_000);

        app
          .close()
          .then(() => {
            clearTimeout(timer);
            resolve();
          })
          .catch(() => {
            clearTimeout(timer);
            resolve();
          });
      });

      await shutdownTracing();
      process.exit(0);
    } catch (err) {
      logger.error(
        'Error during shutdown',
        err instanceof Error ? err.stack : String(err),
      );
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdownApi('SIGTERM'));
  process.on('SIGINT', () => void shutdownApi('SIGINT'));

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

  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.log(`Shutting down worker (${signal})...`);
    try {
      await Promise.all([healthServer.stop(), shutdownTracing()]);
      await app.close();
      process.exit(0);
    } catch (err) {
      logger.error(
        'Error during shutdown',
        err instanceof Error ? err.stack : String(err),
      );
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
