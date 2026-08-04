## 1. Broadcast Snapshot on Running Transition

- [x] 1.1 In `backend/src/index.ts`, after the `stateChange` broadcast (line ~240), add a check: if `event.current === 'Running'`, broadcast a full snapshot via `botWS.broadcast({ channel: 'bot:snapshot', type: 'snapshot', data: botEngine.getSnapshot() })`
