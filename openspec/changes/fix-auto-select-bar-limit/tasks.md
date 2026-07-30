## 1. Fix auto-select bar limit

- [x] 1.1 Add `if (bars.length > 1500)` check after fetching bars in `auto-select.ts`
- [x] 1.2 Fail with error message: `Too many bars: ${bars.length} (max 1500)`
- [x] 1.3 Run TypeScript build — no new errors
