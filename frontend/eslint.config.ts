import vue from "eslint-plugin-vue";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";
import prettier from "eslint-config-prettier";
import type { ESLint, Linter, Rule } from "eslint";
import { noRawColors } from "./eslint-rules/no-raw-colors";

const noTextSelectors: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prefer getByTestId over text-based Playwright selectors for language-independence",
    },
    messages: {
      noText:
        "Prefer getByTestId(TEST_ID.*) over '{{ method }}' — text-based selectors break on i18n.",
      noRoleName:
        "Prefer getByTestId(TEST_ID.*) over getByRole with a 'name' option (role 'option' is exempt for data values).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== "MemberExpression" ||
          callee.property.type !== "Identifier"
        ) {
          return;
        }
        const method = callee.property.name;
        if (method === "getByText" || method === "getByPlaceholder") {
          context.report({ node, messageId: "noText", data: { method } });
        }
        if (method === "getByRole") {
          const [roleArg, optionsArg] = node.arguments;
          if (optionsArg?.type !== "ObjectExpression") return;
          const role = roleArg?.type === "Literal" ? roleArg.value : undefined;
          const hasName = optionsArg.properties.some(
            (p) =>
              p.type === "Property" &&
              p.key.type === "Identifier" &&
              p.key.name === "name",
          );
          if (hasName && role !== "option") {
            context.report({ node, messageId: "noRoleName" });
          }
        }
      },
    };
  },
};

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
      "@typescript-eslint": tsPlugin as unknown as ESLint.Plugin,
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
      "@typescript-eslint": tsPlugin as unknown as ESLint.Plugin,
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
    files: ["src/**/*.ts"],
    ignores: [
      "src/api/**",
      "src/**/__tests__/**",
      "src/**/*.test.ts",
      "src/lib/raw-color-utilities.ts",
    ],
    plugins: {
      theme: { rules: { "no-raw-colors": noRawColors } },
    },
    rules: {
      "theme/no-raw-colors": "error",
    },
  },
  {
    files: ["src/**/*.vue"],
    ignores: ["src/api/**", "src/**/__tests__/**"],
    // UI files are excluded from the base Vue block, so this block must
    // supply the Vue parser itself.
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    plugins: {
      theme: { rules: { "no-raw-colors": noRawColors } },
    },
    rules: {
      "theme/no-raw-colors": "error",
    },
  },
  {
    files: [
      "playwright/**/*.ts",
      "tests/pages/**/*.ts",
      "tests/ct/**/*.ts",
      "tests/e2e/**/*.ts",
      "tests/quality/**/*.ts",
      "playwright-ct.config.ts",
      "playwright-quality.config.ts",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./tsconfig.node.json",
          "./tsconfig.playwright.json",
          "./tests/e2e/tsconfig.json",
        ],
        ecmaVersion: 2020,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin as unknown as ESLint.Plugin,
      playwright: {
        rules: {
          "no-text-selectors": noTextSelectors,
        },
      },
    },
    rules: {
      "no-undef": "off",
      "playwright/no-text-selectors": "error",
    },
  },
];

export default config;
