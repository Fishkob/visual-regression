import { defineConfig, env } from 'prisma/config';
import 'dotenv/config';

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
