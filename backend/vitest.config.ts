import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/unit/**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        '**/*.module.ts',
        '**/*.types.ts',
        '**/main.ts',
        '**/config/**',
        '**/prisma/**',
        '**/dto/**',
        '**/test/**',
        '**/common/interceptors/*.ts',
        '**/common/constants/*.ts',
        '**/queries/*.ts',
        '**/common/utils/image/*.ts',
        '**/generated/**',
      ],
    },
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'test',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_ACCESS_KEY: 'test',
      RUSTFS_SECRET_KEY: 'test',
      RUSTFS_BUCKET: 'test',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
    },
    setupFiles: ['test/jest-shim.ts'],
    alias: {
      '@app': resolve(__dirname, './src/app.module'),
      '@config': resolve(__dirname, './src/config'),
      '@prisma/prisma.module': resolve(
        __dirname,
        './src/prisma/prisma.module.ts',
      ),
      '@/prisma/client': resolve(__dirname, './prisma/generated/client.js'),
      '@': resolve(__dirname, './src'),
      '@common': resolve(__dirname, './src/common'),
      '@public': resolve(__dirname, './src/modules/public'),
      '@internal': resolve(__dirname, './src/modules/internal'),
      '@test': resolve(__dirname, './test'),
    },
  },
});
