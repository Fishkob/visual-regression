import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nestjsTyped from '@darraghor/eslint-plugin-nestjs-typed';
import type { Rule } from 'eslint';

// ADR-059: a locking clause is a mechanism. A string assertion on it proves the
// words are in the statement, not that two claimants cannot both win — it stays
// green for every bug in the transaction around it. The guarantee is proven by a
// database-race case in test/e2e/, so the unit suite may not assert the text.
const LOCKING_CLAUSE =
  /\b(?:FOR\s+(?:NO\s+KEY\s+UPDATE|KEY\s+SHARE|UPDATE|SHARE)|SKIP\s+LOCKED|NOWAIT)\b/i;

const noLockingClauseAssertions: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Assert a locking clause with a database-race case, not by reading the SQL back (ADR-059)',
    },
    schema: [],
    messages: {
      mechanism:
        'This asserts a locking mechanism by reading the SQL back; prove it with a race case in test/e2e/ instead (ADR-059).',
    },
  },
  create(context) {
    const TEXT_ASSERTIONS = new Set(['toContain', 'toContainEqual', 'toMatch']);
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          !TEXT_ASSERTIONS.has(callee.property.name)
        ) {
          return;
        }
        const [argument] = node.arguments;
        if (
          argument?.type !== 'Literal' ||
          typeof argument.value !== 'string'
        ) {
          return;
        }
        if (!LOCKING_CLAUSE.test(argument.value)) return;
        context.report({ node: argument, messageId: 'mechanism' });
      },
    };
  },
};

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  nestjsTyped.configs.flatRecommended,
  {
    ignores: [
      '**/generated/**',
      'src/swagger*.ts',
      'src/scripts/**',
      'src/prisma/**',
    ],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@darraghor/nestjs-typed/injectable-should-be-provided': 'off',

      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-require-imports': [
        'error',
        { allow: ['@opentelemetry', '@prisma', 'dotenv'] },
      ],

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['PascalCase', 'UPPER_CASE'],
          types: ['boolean'],
          prefix: ['is', 'should', 'has', 'can', 'did', 'will'],
        },
        {
          selector: 'variableLike',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
        },
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          filter: {
            regex: '\\d{10}$',
            match: false,
          },
        },
        {
          selector: 'property',
          modifiers: ['readonly'],
          format: ['camelCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts', 'vitest.config.ts', 'vitest.config.e2e.ts'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // Test doubles are loosely typed by design: a fixture builds a payload the
      // production type would fight, and a mock stands in for a dependency it
      // does not implement. These six rules accounted for 483 of the 485 errors
      // the first run over the suite produced, and none of them says anything
      // about whether a test is right — the type checker and the suite itself
      // still catch a real mistake in a spec.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/dot-notation': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // ADR-059, enforced: a unit spec may not assert a locking clause. The rule is
    // deliberately narrow — it reads no policy predicate, only the mechanism
    // tokens — because the policy/mechanism line beyond them is review, and a
    // rule that guesses would produce disables that mean nothing.
    files: ['test/unit/**/*.ts'],
    plugins: {
      local: {
        rules: { 'no-locking-clause-assertions': noLockingClauseAssertions },
      },
    },
    rules: {
      'local/no-locking-clause-assertions': 'error',
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
);
