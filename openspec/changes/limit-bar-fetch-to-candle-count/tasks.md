## 1. Update BarFetcher interface

- [x] 1.1 Add optional `limit?: number` parameter to `BarFetcher.fetchBars` interface
- [x] 1.2 Update `BybitBarFetcher.fetchBars` to accept and use limit parameter

## 2. Update auto-select to pass limit

- [x] 2.1 Pass `targetCandles` as limit to `this.barFetcher.fetchBars()`
- [x] 2.2 Truncate fetched bars to `targetCandles` if fetch returns more

## 3. Verify

- [x] 3.1 Run TypeScript build — no new errors
