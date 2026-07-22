import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'backend/tests/**/*.test.ts'],
    pool: 'forks',
    maxWorkers: 2,
  },
});
