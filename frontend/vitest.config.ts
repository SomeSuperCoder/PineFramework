import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source'],
    alias: [
      { find: 'pine-framework/utils/time', replacement: path.resolve(__dirname, '../src/utils/time.ts') },
      { find: 'pine-framework', replacement: path.resolve(__dirname, '../src/frontend-safe.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
