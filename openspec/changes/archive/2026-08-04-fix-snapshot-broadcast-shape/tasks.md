## 1. Fix Snapshot Broadcast Shape

- [x] 1.1 In `backend/src/index.ts`, change `data: botEngine.getSnapshot()` to `data: { status: botEngine.getSnapshot() }` in the Running transition broadcast
