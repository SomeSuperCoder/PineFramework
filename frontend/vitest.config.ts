import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    conditions: ['source'],
    alias: [
      { find: 'pine-framework/contracts', replacement: path.resolve(__dirname, '../src/contracts/index.ts') },
      { find: 'pine-framework/utils/time', replacement: path.resolve(__dirname, '../src/utils/time.ts') },
      { find: 'pine-framework/utils/script-name', replacement: path.resolve(__dirname, '../src/utils/script-name.ts') },
      { find: 'pine-framework', replacement: path.resolve(__dirname, '../src/frontend-safe.ts') },
      // App-internal alias consumed by shadcn/ui components (e.g. @/lib/utils)
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'src/__tests__/logger/**/*.test.ts'],
  },
});
