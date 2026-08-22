import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['test/jest-shim.ts'],
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30000,
    fileParallelism: false,
    globalSetup: ['test/e2e/global/setup.ts'],
    reporters: 'verbose',
    deps: {
      optimizer: {
        ssr: {
          include: ['pixelmatch', 'pngjs', '@prisma/adapter-pg'],
        },
      },
    },
    alias: {
      '@app': resolve(__dirname, './src/app.module.ts'),
      '@prisma/prisma.module': resolve(
        __dirname,
        './src/prisma/prisma.module.ts',
      ),
      '@/prisma/prisma.module': resolve(
        __dirname,
        './src/prisma/prisma.module.ts',
      ),
      '@/prisma/client': resolve(__dirname, './prisma/generated/client.js'),
      '@config': resolve(__dirname, './src/config'),
      '@common': resolve(__dirname, './src/common'),
      '@public': resolve(__dirname, './src/modules/public'),
      '@internal': resolve(__dirname, './src/modules/internal'),
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test'),
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vrt',
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'vrt',
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9000',
      MINIO_ACCESS_KEY: 'minioadmin',
      MINIO_SECRET_KEY: 'minioadmin',
      MINIO_BUCKET: 'vrt',
      MINIO_USE_SSL: 'false',
      MINIO_PUBLIC_URL: 'http://localhost:9000',
      PDF_SIDECAR_URL: 'http://localhost:3001',
      PDF_SIDECAR_TIMEOUT: '30000',
      METRICS_API_KEY: 'test-metrics-key',
      ADMIN_API_KEY: 'test-admin-key',
    },
  },
});
