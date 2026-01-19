const js = require('@eslint/js');
const importPlugin = require('eslint-plugin-import');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

const typeScriptRecommended = tsPlugin.configs['flat/recommended'].map((config, index) => {
  if (index === 0) {
    return {
      ...config,
      languageOptions: {
        ...config.languageOptions,
        parser: tsParser,
        parserOptions: {
          project: ['./tsconfig.json', './tsconfig.build.json'],
          tsconfigRootDir: __dirname,
          ecmaVersion: 2022,
          sourceType: 'module',
          noWarnOnMultipleProjects: true,
        },
      },
    };
  }

  return config;
});

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      'scripts/**',
      '.husky/**',
      'tests/*.js',
      'jest.config.js',
      'eslint.config.cjs',
      'src/teamcity-client/**',
    ],
  },
  {
    rules: js.configs.recommended.rules,
  },
  ...typeScriptRecommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      'no-console': 'error',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: true,
          allowNumber: true,
          allowNullableObject: true,
          allowNullableBoolean: true,
          allowNullableString: true,
          allowNullableNumber: true,
          allowAny: false,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'typeAlias', format: ['PascalCase'] },
        { selector: 'enum', format: ['PascalCase'] },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'method', format: ['camelCase'] },
        {
          selector: 'classProperty',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
      ],
      'import/order': 'off',
      'import/no-duplicates': 'error',
      'import/no-unused-modules': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-default-export': 'off',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-duplicate-imports': 'error',
      'sort-imports': 'off',
      'no-implicit-coercion': 'error',
      'no-param-reassign': 'error',
      'no-return-assign': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-await-in-loop': 'warn',
      'require-atomic-updates': 'error',
      // Warn on double type assertions (as unknown as X) - prefer type guards or Zod schemas
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'TSAsExpression > TSAsExpression[typeAnnotation.typeName.name="unknown"]',
          message:
            'Avoid `as unknown as` double assertions. Use type guards, Zod schemas, or add an eslint-disable comment explaining why this is necessary.',
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./tsconfig.json', './tsconfig.build.json'],
        },
      },
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    languageOptions: {
      globals: globals.jest,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-require-imports': 'off',
      'require-atomic-updates': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['jest.config.js', '*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-default-export': 'off',
    },
  },
  prettierConfig,
];
