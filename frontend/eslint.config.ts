import vue from "eslint-plugin-vue";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";
import prettier from "eslint-config-prettier";
import type { Linter } from "eslint";

const config: Linter.FlatConfig[] = [
  prettier,
  {
    ignores: ["playwright/.cache/**"],
  },
  {
    files: ["**/*.vue"],
    ignores: ["src/api/**", "src/components/**/ui/**"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    plugins: {
      vue,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    ignores: ["**/*.vue", "src/api/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd(),
        ecmaVersion: 2020,
        sourceType: "module",
      },
      globals: {
        document: "readonly",
        window: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        console: "readonly",
        fetch: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-misused-promises": "warn",
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  {
    files: [
      "playwright/**/*.ts",
      "tests/pages/**/*.ts",
      "tests/ct/**/*.ts",
      "playwright-ct.config.ts",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./tsconfig.node.json",
          "./tsconfig.playwright.json",
        ],
        tsconfigRootDir: process.cwd(),
        ecmaVersion: 2020,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-undef": "off",
    },
  },
];

export default config;
