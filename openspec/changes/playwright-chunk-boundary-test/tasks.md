## 1. Setup Playwright

- [x] 1.1 Install `@playwright/test` in the frontend package: `pnpm --filter pine-framework-frontend add -D @playwright/test`
- [x] 1.2 Create `frontend/playwright.config.ts` with baseURL `http://localhost:3000`, webServer config to start backend (port 8081) and frontend (port 3000)
- [x] 1.3 Add `test:e2e` script to `frontend/package.json`: `"test:e2e": "playwright test"`
- [x] 1.4 Add seed OHLCV dataset endpoint `GET /api/ohlcv/seed` that returns 10,000 zigzag bars

## 2. Add Test Data Bridge

- [x] 2.1 In `ChartComponent.tsx`, add a `useEffect` that writes `window.__pineTestData` when debugMode is enabled: expose `indicatorResults` (labels + lines per indicator) and `chunkBorders`
- [x] 2.2 Guard the bridge with `if (debugMode)` — no production impact
- [ ] 2.3 Verify that `window.__pineTestData` updates after chunk loads (labels/lines reflect merged state)

## 3. Implement E2E Test

- [ ] 3.1 Create `frontend/e2e/chunk-boundary.spec.ts` with the core test
- [ ] 3.2 Test flow: navigate to `/?debug=true`, load HHLL indicator via API, wait for computation
- [ ] 3.3 Add scroll-back simulation: `page.mouse.wheel()` on chart canvas, wait for chunk border count to increase
- [ ] 3.4 Assert label count equals line count for HHLL indicator after each scroll-back
- [ ] 3.5 Assert no duplicate (time, price) labels after each scroll-back
- [ ] 3.6 Assert labels within 5 bars of each chunk border have associated lines
- [ ] 3.7 Assert scroll-back works for at least 3 chunk boundaries (no "wall")

## 4. Run and Verify

- [ ] 4.1 Run `pnpm test:e2e` (filtered to just the chunk-boundary test)
- [ ] 4.2 Fix any failures: adjust timeouts, wait strategies, or scroll simulation
- [ ] 4.3 Run all existing tests (`pnpm test`) to confirm no regressions from the bridge changes
