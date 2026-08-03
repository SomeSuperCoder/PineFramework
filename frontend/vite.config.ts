import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source'],
    alias: [
      // More specific subpath aliases FIRST
      { find: 'pine-framework/utils/time', replacement: path.resolve(__dirname, '../src/utils/time.ts') },
      // Fallback: route main entry to frontend-safe version (no trading/Node.js)
      { find: 'pine-framework', replacement: path.resolve(__dirname, '../src/frontend-safe.ts') },
    ],
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
