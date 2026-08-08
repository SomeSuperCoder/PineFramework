import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    conditions: ['source'],
    alias: [
      // More specific subpath aliases FIRST
      { find: 'pine-framework/utils/time', replacement: path.resolve(__dirname, '../src/utils/time.ts') },
      { find: 'pine-framework/utils/script-name', replacement: path.resolve(__dirname, '../src/utils/script-name.ts') },
      // Fallback: route main entry to frontend-safe version (no trading/Node.js)
      { find: 'pine-framework', replacement: path.resolve(__dirname, '../src/frontend-safe.ts') },
      // App-internal alias consumed by shadcn/ui components (e.g. @/lib/utils)
      { find: '@', replacement: path.resolve(__dirname, './src') },
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
