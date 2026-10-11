// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.strict],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description', 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
      'import/no-duplicates': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Node-side config and build scripts: these run in a terminal, so printing
    // progress is the point.
    files: ['*.config.js', '*.config.ts', 'scripts/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
  prettierConfig,
  {
    ignores: [
      'node_modules/*',
      'dist/*',
      '.vercel/*',
      'ios/*',
      'android/*',
      '.expo/*',
      'expo-env.d.ts',
      'supabase/functions/*',
      'src/lib/supabase/database.types.ts',
    ],
  },
]);
