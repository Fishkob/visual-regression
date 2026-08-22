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
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@sdk": path.resolve(__dirname, "../client-sdk"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    exclude: [
      "**/node_modules/**",
      "**/tests/pages/**",
      "**/tests/e2e/**",
      "**/e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,vue}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.ts",
        "src/__tests__/**",
        "src/main.ts",
        "src/App.vue",
        "src/components/ui/**",
        "tests/**",
        "node_modules/**",
      ],
    },
  },
});
