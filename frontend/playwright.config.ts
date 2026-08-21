import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  // Specs mutate SHARED backend state (indicator store) through one dev
  // server — parallel workers interleave POST/DELETE mid-flight and race
  // each other's fixtures. One worker = deterministic user-flow proofs.
  workers: 1,
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
