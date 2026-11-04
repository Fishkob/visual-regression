import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30000,
    fileParallelism: false,
    globalSetup: ['test/e2e/global/setup.ts'],
    reporters: 'verbose',
    // The HTTP suite is where the controllers, pipes, guards and the database
    // behaviour are actually exercised, so its coverage is the other half of the
    // picture. It is reported into its own directory and merged by
    // `pnpm run coverage:all`; the gate itself stays on the unit run.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      reportsDirectory: './coverage/e2e',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.module.ts',
        '**/*.types.ts',
        '**/main.ts',
        '**/generated/**',
        '**/test/**',
        'src/scripts/**',
        'src/tracing.setup.ts',
      ],
    },
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
      // A dedicated database and bucket: the suite truncates what it can see
      // and the sweeps delete what they consider orphaned, so it must never
      // share the dev stack's data.
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vrt_e2e',
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'vrt_e2e',
      RUSTFS_ENDPOINT: 'localhost',
      RUSTFS_PORT: '9000',
      RUSTFS_ACCESS_KEY: 'rustfsadmin',
      RUSTFS_SECRET_KEY: 'rustfsadmin',
      RUSTFS_BUCKET: 'vrt-e2e',
      RUSTFS_USE_SSL: 'false',
      RUSTFS_PUBLIC_URL: 'http://localhost:9000',
      PDF_SIDECAR_URL: 'http://localhost:3001',
      PDF_SIDECAR_TIMEOUT: '30000',
      METRICS_API_KEY: 'test-metrics-key',
      ADMIN_API_KEY: 'test-admin-key',
      TOTP_ENCRYPTION_KEY: 'e2e-totp-encryption-key-0123456789abcdef',
      LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
      ADMIN_RATE_LIMIT_PER_MINUTE: '1000',
      RENDER_RATE_LIMIT_PER_MINUTE: '1000',
      LOG_RATE_LIMIT_PER_MINUTE: '1000',
      UPLOAD_RATE_LIMIT_PER_MINUTE: '0',
    },
  },
});
