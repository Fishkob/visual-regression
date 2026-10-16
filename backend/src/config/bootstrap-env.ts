import * as fs from 'fs';
import * as path from 'path';
import { config as loadEnvFile } from 'dotenv';
import { ENV_FILES } from './env-files';
import { envValidationSchema } from './env.validation';

// Load the env files exactly once, before the Nest DI container (ConfigModule)
// exists. They are read from the working directory (backend/ for every pnpm
// script and for the compiled runtime), matching ConfigModule's envFilePath.
export function loadEnv(cwd: string = process.cwd()): string[] {
  const envFiles = ENV_FILES.map((file) => path.resolve(cwd, file)).filter(
    (file) => fs.existsSync(file),
  );

  if (envFiles.length > 0) {
    loadEnvFile({ path: envFiles, quiet: true });
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `No env file found (looked for ${ENV_FILES.join(', ')} in ${cwd}) — using the process environment. Run ./scripts/dev.sh local to create backend/.env.local.`,
    );
  }

  return envFiles;
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
