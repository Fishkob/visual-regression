import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "./backend/swagger.json",
  output: {
    path: "./client-sdk",
    clean: false,
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      enums: "javascript",
    },
    { name: "@hey-api/sdk" },
    { name: "@hey-api/client-fetch" },
  ],
  parser: {
    hooks: {
      symbols: {
        getFilePath: (symbol) => {
          if (symbol.kind === "type" && symbol.name) {
            return `models/${symbol.name}`;
          }
          return;
        },
      },
    },
  },
});
