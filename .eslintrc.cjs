module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'prettier/prettier': 'error',
  },
  overrides: [
    {
      // Frontend has its own tsconfig project (bundler resolution, JSX) —
      // lint it with that project so parserOptions.project resolves types.
      files: ['frontend/src/**/*.ts', 'frontend/src/**/*.tsx', 'frontend/e2e/**/*.ts'],
      extends: ['plugin:@typescript-eslint/recommended'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './frontend/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      env: {
        browser: true,
      },
    },
    {
      // Playwright e2e specs are not part of any tsconfig "project" —
      // lint them untyped (no type-aware rules).
      files: ['frontend/e2e/**/*.ts'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: false,
      },
    },
    {
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',
        'no-constant-condition': 'off',
        'prefer-const': 'off',
        'no-useless-escape': 'off',
      },
    },
  ],
};
