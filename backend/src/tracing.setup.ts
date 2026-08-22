import * as path from 'path';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PrismaInstrumentation } from '@prisma/instrumentation';

// Load .env early so the OTEL endpoint (and other vars) are available before
// ConfigModule initializes. dotenv does not override already-set variables.
try {
  const dotenv = require('dotenv') as {
    config: (opts: { path: string }) => void;
  };
  dotenv.config({
    path: path.resolve(__dirname, '../.env'),
  });
} catch {
  // dotenv not available
}

let sdk: NodeSDK | null = null;

export function startTracing(endpoint: string | undefined): void {
  if (!endpoint) {
    return;
  }

  try {
    const nodeSdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
      instrumentations: [
        new HttpInstrumentation(),
        new ExpressInstrumentation(),
        new PrismaInstrumentation(),
      ],
    });

    nodeSdk.start();
    sdk = nodeSdk;
  } catch (err) {
    console.warn(
      'OpenTelemetry tracing unavailable:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function shutdownTracing(): Promise<void> {
  await sdk?.shutdown();
}
