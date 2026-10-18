import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";

import { noRawColors } from "../../eslint-rules/no-raw-colors";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    parserOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-raw-colors", noRawColors, {
  valid: [
    {
      code: '<template><div class="bg-card text-foreground border-border" /></template>',
    },
    {
      code: 'export const className = "bg-status-success";',
      filename: "example.ts",
    },
  ],
  invalid: [
    {
      code: '<template><div class="bg-white" /></template>',
      errors: [{ messageId: "rawColor" }],
    },
    {
      code: "<template><div :class=\"'text-gray-700'\" /></template>",
      errors: [{ messageId: "rawColor" }],
    },
    {
      code: 'export const className = "bg-red-500";',
      filename: "example.ts",
      errors: [{ messageId: "rawColor" }],
    },
  ],
});
