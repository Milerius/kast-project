// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  {
    // Apply typed TypeScript rules only to TS/TSX source files
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.base.json',
          './apps/*/tsconfig.json',
          './packages/*/tsconfig.json',
          './integration-tests/tsconfig.json',
          './scenario-tests/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // NOTE: eslint-config-next@15.0.2 is incompatible with ESLint v9 flat config
  // (its @rushstack/eslint-patch crashes outside legacy ESLint internals).
  // This block will be re-added once apps/web is scaffolded with a
  // Next.js version that ships a native flat config export (>=15.3 or 16.x).
  // {
  //   files: ['apps/web/**/*.{ts,tsx}'],
  //   ...nextPlugin,
  // },
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'docker/**',
      'scripts/**',
      'apps/web/next-env.d.ts',
    ],
  },
  prettier,
);
