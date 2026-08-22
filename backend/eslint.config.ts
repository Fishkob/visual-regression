import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nestjsTyped from '@darraghor/eslint-plugin-nestjs-typed';

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
      'test/jest-shim.ts',
      'test/**/*.ts',
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
        ...globals.jest,
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

      '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/dot-notation': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
);
