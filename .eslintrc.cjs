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
