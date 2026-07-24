## Why

Chunk border bugs (label stacking, label disappearance, line overextension, missing lines) have been chased through unit tests and manual fixes, but each fix reveals another issue. The problem is that unit tests in `indicator-merge.test.ts` test the merge function in isolation — they cannot detect runtime errors like re-execution state differences, rendering glitches, or infinite scroll failures.

A Playwright end-to-end test will load the real chart in debug mode with the HHLL indicator, simulate user scroll-back, and assert invariants like "every label has a line" and "labels don't stack at chunk borders." This catches the full class of chunk-border bugs in one shot.

## What Changes

- Add Playwright as a dev dependency in the frontend package
- Create an e2e test that:
  - Starts the backend and frontend servers
  - Opens the chart with debug mode enabled
  - Loads the HHLL indicator script
  - Scrolls back past multiple chunk boundaries
  - Asserts label count equals line count (no orphan labels)
  - Asserts no duplicate labels at the same timestamp+price
  - Asserts labels at chunk borders have attached lines
  - Asserts infinite scroll does not block (no "wall")
- Add a `test:e2e` script to package.json

## Capabilities

### New Capabilities
- `playwright-e2e`: End-to-end tests using Playwright that validate the full chart rendering pipeline with real indicators and simulated user interaction

### Modified Capabilities
- (none)

## Impact

**New dependencies:** `@playwright/test` in frontend package
**New files:** `frontend/e2e/chunk-boundary.spec.ts`, Playwright config
**Modified files:** `frontend/package.json` (add scripts and dev dependencies)
**Non-goals:** Unit test refactoring, changing the indicator engine, modifying the merge logic
