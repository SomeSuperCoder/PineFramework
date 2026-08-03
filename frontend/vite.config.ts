import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source'],
    alias: {
      // Route pine-framework to a frontend-safe entry that excludes
      // the trading module (which depends on Node.js built-ins).
      'pine-framework': path.resolve(__dirname, '../src/frontend-safe.ts'),
      'pine-framework/utils/time': path.resolve(__dirname, '../src/utils/time.ts'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
      },
    },
  },
});
