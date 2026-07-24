import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm --filter pine-framework-backend dev',
      port: 8081,
      cwd: '..',
      timeout: 30_000,
      reuseExistingServer: true,
    },
    {
      command: 'pnpm --filter pine-framework-frontend dev',
      port: 3000,
      cwd: '..',
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],
});
