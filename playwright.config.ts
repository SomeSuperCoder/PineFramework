import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  // No webServer — both backend and frontend must be running manually.
  // Backend:  cd backend && pnpm exec tsx watch src/index.ts
  // Frontend: cd frontend && pnpm dev
});
