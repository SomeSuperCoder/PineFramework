import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve pine-framework to its TS source via the `source` export condition,
    // matching how the backend dev script runs (tsx watch --conditions=source).
    conditions: ['source'],
    alias: {
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
