import * as fs from 'fs';
import * as path from 'path';
import { config as loadEnvFile } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// The Prisma CLI is invoked from backend/ (dev.sh and the package scripts), so
// resolve the same files the runtime loads, relative to the working directory.
const envFiles = ['.env.local', '.env']
  .map((file) => path.resolve(process.cwd(), file))
  .filter((file) => fs.existsSync(file));

if (envFiles.length > 0) {
  loadEnvFile({ path: envFiles, quiet: true });
}

const host = env('POSTGRES_HOST') || 'localhost';
const port = env('POSTGRES_PORT') || 5432;
const user = env('POSTGRES_USER');
const password = env('POSTGRES_PASSWORD');
const db = env('POSTGRES_DB');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: `postgresql://${user}:${password}@${host}:${port}/${db}`,
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
