## 1. Fix Duration Metric

- [x] 1.1 In `TradingBotPanel.tsx`, replace `fmtDur(status.uptimeMs)` at line 2229 with `fmtDur(now - (status.startedAt ?? 0))` to compute uptime client-side using the existing 1-second timer
