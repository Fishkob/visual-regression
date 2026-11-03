/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      // Anchored: a plain "/api" prefix would also swallow the SPA route
      // /api-keys and turn a page refresh into a backend 404.
      "^/api/": {
        target: "http://localhost:3000",
        // Keep the browser's Host header: the backend's same-origin guard
        // compares the Origin host to the request Host, and rewriting it to
        // the target made every mutation look cross-origin in local dev.
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: true,
  },
  resolve: {
    // `@sdk` resolves to the SDK's source entry, not to its package root: the
    // package `exports` point at `dist/` (that is what external consumers get),
    // and the repo does not build the SDK for local dev or the test suites.
    // The regexes come first so that `@sdk/models/...` still reaches the source
    // tree instead of being swallowed by the `@` alias below.
    alias: [
      {
        find: /^@sdk$/,
        replacement: path.resolve(__dirname, "../client-sdk/index.ts"),
      },
      {
        find: /^@sdk\//,
        replacement: `${path.resolve(__dirname, "../client-sdk")}/`,
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    // 136 jsdom environments run in parallel and the v8 instrumentation adds
    // its own load; the 5s default is too tight for the heaviest files and
    // produced an observed timeout in TestDetailDispatcher while its file ran
    // green in isolation. This is the ceiling, not the target: a test that
    // needs seconds is still a bug worth fixing.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    exclude: [
      "**/node_modules/**",
      "**/tests/ct/**",
      "**/tests/e2e/**",
      "**/tests/quality/**",
      "**/e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,vue}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/**/*.story.ts",
        "src/__tests__/**",
        "src/main.ts",
        "src/App.vue",
        "src/components/ui/**",
        // Wiring, not logic: the route table plus createRouter. Every guard it
        // installs is tested through lib/auth-guard and lib/route-focus, the
        // table invariants by router-routes.test.ts, and the navigation itself
        // by the e2e suite against the real router. The lazy `component: () =>
        // import(...)` entries can never execute under Vitest, so the file
        // would cap the layer at a number that says nothing about test quality.
        "src/router/index.ts",
        // Views and .vue components are covered by the page-level Playwright CT
        // suite (tests/ct), not by Vitest — this config has never been able to
        // reach them. Leaving them in the denominator measured a layer this
        // runner does not test: 60% was unreachable, so the gate was red for
        // reasons that had nothing to do with a missing test. Logic files stay
        // in scope, including non-.vue modules under components/ (StatusBadge,
        // DataTable's helpers) which do carry Vitest tests.
        "src/views/**",
        "src/components/**/*.vue",
        "tests/**",
        "node_modules/**",
      ],
      // One threshold per layer, raised when a gap is closed and never lowered
      // to turn a red run green — the rule ADR-054 set for the backend, applied
      // to the layer this runner actually measures. The single global 60/45 the
      // suite carried sat ~30 points below its measured value, so a third of the
      // coverage could disappear without a red gate. Each number is the measured
      // value of that layer minus 1-2 points of slack for a day's refactoring,
      // not a target to grow into; the global block stays as the floor for
      // whatever no glob claims.
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
        "src/domains/**": {
          statements: 97,
          branches: 87,
          functions: 98,
          lines: 97,
        },
        "src/composables/**": {
          statements: 91,
          branches: 78,
          functions: 90,
          lines: 91,
        },
        "src/lib/**": {
          statements: 91,
          branches: 84,
          functions: 88,
          lines: 94,
        },
        "src/i18n/**": {
          statements: 93,
          branches: 60,
          functions: 98,
          lines: 99,
        },
        "src/components/**": {
          statements: 98,
          branches: 98,
          functions: 98,
          lines: 98,
        },
      },
    },
  },
});
