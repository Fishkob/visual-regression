import * as path from 'path';
import { envValidationSchema } from './env.validation';

// Load .env exactly once, before the Nest DI container (ConfigModule) exists.
// dotenv does not override already-set variables, so a real environment wins.
export function loadEnv(): void {
  try {
    const dotenv = require('dotenv') as {
      config: (opts: { path: string }) => void;
    };
    dotenv.config({
      path: path.resolve(__dirname, '../../.env'),
    });
  } catch {
    // dotenv not available
  }
}

export interface BootstrapEnv {
  nodeMode: 'api' | 'worker';
  otelExporterEndpoint: string;
}

// The pre-DI view of the environment. It validates with the same Joi schema the
// ConfigModule uses, so bootstrap branching can neither read an invalid value
// nor miss a Joi default — the failure mode a hand-built
// `new AppConfigService(new ConfigService())` had before the container existed.
export function readBootstrapEnv(
  env: NodeJS.ProcessEnv = process.env,
): BootstrapEnv {
  const result = envValidationSchema.validate(env, {
    allowUnknown: true,
    abortEarly: false,
  });
  if (result.error) {
    throw new Error(
      `Invalid environment configuration:\n${result.error.message}`,
    );
  }
  const validated = result.value as {
    NODE_MODE: 'api' | 'worker';
    OTEL_EXPORTER_OTLP_ENDPOINT: string;
  };
  return {
    nodeMode: validated.NODE_MODE,
    otelExporterEndpoint: validated.OTEL_EXPORTER_OTLP_ENDPOINT,
  };
}
