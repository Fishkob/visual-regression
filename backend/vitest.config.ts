import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Files whose behaviour is verified by the HTTP suite, not by unit tests. The
// controllers are thin (validate → delegate → map) and their real contract is a
// status code and a body, so a unit test can only assert that they call the
// service. Excluding them keeps the unit gate about the layers it can actually
// judge; the merged report (`pnpm run coverage:all`) shows what covers them.
const E2E_OWNED = [
  '**/presentation/**',
  'src/scripts/**',
  'src/tracing.setup.ts',
  // Entry wiring: `main.ts` is the entry point, `bootstrap.ts` is what it calls.
  // `boot-smoke.e2e-spec.ts` starts this and asserts what it configured, so it
  // is covered where it is written instead of by a unit test that would have to
  // re-state the bootstrap.
  'src/bootstrap.ts',
];

const COVERAGE_EXCLUDE = [
  '**/*.module.ts',
  '**/*.types.ts',
  '**/main.ts',
  '**/dto/**',
  '**/test/**',
  '**/generated/**',
  ...E2E_OWNED,
];

export default defineConfig({
  oxc: {
    decorator: {
      legacy: true,
      emitDecoratorMetadata: true,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['test/unit/**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/unit',
      include: ['src/**/*.ts'],
      exclude: COVERAGE_EXCLUDE,
      // Thresholds are a ratchet per layer, not one number for the whole tree:
      // a global 95 forced query-shape tests into the repositories and left the
      // controllers at 54%. Each layer is held at what its own tests can prove,
      // so the numbers move only when that layer changes. Raise a number after
      // closing a gap; never lower one to make a red run green.
      thresholds: {
        statements: 87,
        branches: 77,
        lines: 87,
        functions: 84,
        'src/modules/public/**/core/domain/**': {
          statements: 97,
          branches: 96,
          lines: 97,
          functions: 99,
        },
        'src/common/**': {
          statements: 95,
          branches: 91,
          lines: 95,
          functions: 96,
        },
        'src/modules/public/**/application/**': {
          statements: 81,
          branches: 66,
          lines: 82,
          functions: 85,
        },
        'src/modules/public/**/infrastructure/**': {
          statements: 74,
          branches: 70,
          lines: 75,
          functions: 65,
        },
        'src/modules/internal/**': {
          statements: 89,
          branches: 76,
          lines: 89,
          functions: 84,
        },
      },
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
