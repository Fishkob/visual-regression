import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { AppLoggerService } from './app-logger.service';
import { shutdownTracing } from '@/tracing.setup';

// Teardown that is not owned by a single feature provider (currently flushing
// the OpenTelemetry SDK) lives here as a lifecycle hook rather than as a signal
// handler in main.ts. `app.enableShutdownHooks()` turns SIGTERM/SIGINT into
// `app.close()`, which runs this alongside PrismaConnection.$disconnect and the
// storage/poller onModuleDestroy hooks, after the HTTP server has closed.
@Injectable()
export class AppShutdownService implements OnApplicationShutdown {
  constructor(private readonly logger: AppLoggerService) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      signal ? `Received ${signal}, shutting down` : 'Shutting down',
    );
    await shutdownTracing();
  }
}
